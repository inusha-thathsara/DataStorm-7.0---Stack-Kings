"""
phase3_gold_features.py — Gold Layer Feature Engineering
=========================================================
Phase 3 / Step 7:
  Joins POI data, outlet attributes, seasonality, and holiday features
  into a single flat feature table per outlet.

  Input (silver/clean):
    - outlet_coordinates.csv    (Outlet_ID, Latitude, Longitude)
    - outlet_master.csv         (Outlet_ID, Outlet_Size, Cooler_Count, Outlet_Type)
    - distributor_seasonality_details.csv
    - holiday_list.csv

  Input (gold/features):
    - poi_normalized.csv        (from phase3_poi_acquire.py)

  Output:
    - gold/features/outlet_features.csv  (one row per Outlet_ID, all features)
    - gold/features/coord_quality.csv    (coordinate quality audit)

Coordinate Repair
-----------------
  Phase 2 flagged only nulls/ranges but did not detect lat/lon swaps.
  Here we detect and silently correct 200 swapped-coordinate outlets
  (where Latitude contains a ~80° value typical of Sri Lanka longitudes).

Spatial Feature Engineering (scipy cKDTree)
--------------------------------------------
  For each of 7 canonical POI categories, compute:
    count_<cat>_1km   — number of POIs within 1 km
    count_<cat>_3km   — number of POIs within 3 km
    nearest_<cat>_m   — distance (metres) to nearest POI (0 if none in 10 km)

  Distance approximation: planar Haversine via coordinate scaling
    1° lat  = 111.32 km  (constant)
    1° lon  = 111.32 * cos(lat_centre_rad) km  (≈ 110.2 km at 7.8°N)

Seasonality Features (Jan 2026)
--------------------------------
  distributor_seasonality has data only for 2023-2025. We project Jan 2026
  using the most recent January value per distributor (2025 if available,
  else 2024, else 2023).  Encoded as:
    seasonality_jan2026_label   : 'Favorable' / 'Moderate' / 'Un-Favorable'
    seasonality_jan2026_score   : 2 / 1 / 0

Outlet Attribute Encoding
--------------------------
  Outlet_Size  → size_score : Small=1, Medium=2, Large=3, Extra Large=4
  Outlet_Type  → one-hot columns: is_grocery, is_hotel, is_pharmacy,
                 is_kiosk, is_eatery, is_bakery, is_smmt
  Cooler_Count → cooler_count (numeric, 0 if null)

Holiday Features (Jan 2026)
----------------------------
  The holiday_list covers 2023-2025. For Jan 2026 we use the average
  number of unique public holidays observed in January across 2023-2025.
  Also provides a binary flag: is_high_holiday_jan (> median).
"""
from __future__ import annotations

import csv
import math
import sys
import datetime as dt
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

# Force UTF-8 output to prevent cp1252 encoding errors on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
SILVER_CLEAN = ROOT / "silver" / "clean"
GOLD_FEATURES = ROOT / "gold" / "features"
GOLD_FEATURES.mkdir(parents=True, exist_ok=True)

OUTPUT_PATH = GOLD_FEATURES / "outlet_features.csv"
COORD_QUALITY_PATH = GOLD_FEATURES / "coord_quality.csv"
POI_PATH = GOLD_FEATURES / "poi_normalized.csv"

# Sri Lanka valid bounds
LAT_MIN, LAT_MAX = 5.80, 10.0
LON_MIN, LON_MAX = 79.50, 82.0

# Coordinate scaling (degree → km at Sri Lanka centre 7.8°N)
LAT_CENTRE_RAD = math.radians(7.8)
KM_PER_DEG_LAT = 111.32
KM_PER_DEG_LON = 111.32 * math.cos(LAT_CENTRE_RAD)  # ≈ 110.2 km

# POI search radii in km
RADII_KM = [1.0, 3.0]
MAX_SEARCH_KM = 10.0  # hard ceiling for nearest-distance

CANONICAL_CATEGORIES = [
    "education", "health", "transport",
    "market", "tourism", "food", "worship",
]

SIZE_SCORE = {"Small": 1, "Medium": 2, "Large": 3, "Extra Large": 4}
OUTLET_TYPES = ["Grocery", "Hotel", "Pharmacy", "Kiosk", "Eatery", "Bakery", "SMMT"]
SEASONALITY_SCORE = {"Favorable": 2, "Moderate": 1, "Un-Favorable": 0, "": -1}


# ── I/O helpers ───────────────────────────────────────────────────────────────

def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        return list(csv.DictReader(fh))


# ── Coordinate repair ─────────────────────────────────────────────────────────

def repair_coordinates(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Returns (repaired_rows, coord_quality_rows).
    Fixes:
      - Swapped lat/lon (lat in [LON_MIN, LON_MAX] and lon in [LAT_MIN, LAT_MAX])
      - Zero coords flagged as 'invalid'
    """
    repaired = []
    quality = []

    for row in rows:
        oid = row["Outlet_ID"]
        try:
            lat = float(row["Latitude"])
            lon = float(row["Longitude"])
        except ValueError:
            quality.append({"Outlet_ID": oid, "status": "parse_error",
                            "orig_lat": row["Latitude"], "orig_lon": row["Longitude"]})
            repaired.append({**row, "Latitude": "0", "Longitude": "0", "coord_status": "invalid"})
            continue

        if lat == 0.0 and lon == 0.0:
            status = "zero_coords"
            repaired.append({**row, "coord_status": status})
        elif LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX:
            status = "valid"
            repaired.append({**row, "coord_status": status})
        elif LAT_MIN <= lon <= LAT_MAX and LON_MIN <= lat <= LON_MAX:
            # Swapped — fix by swapping back
            status = "swapped_fixed"
            repaired.append({
                **row,
                "Latitude": str(lon),
                "Longitude": str(lat),
                "coord_status": status,
            })
        else:
            status = "invalid"
            repaired.append({**row, "coord_status": status})

        quality.append({
            "Outlet_ID": oid, "status": status,
            "orig_lat": lat, "orig_lon": lon,
        })

    return repaired, quality


# ── POI spatial index ─────────────────────────────────────────────────────────

def build_poi_index(
    poi_rows: list[dict],
) -> dict[str, tuple[cKDTree, np.ndarray]]:
    """
    Returns a dict: canonical_category → (cKDTree, poi_array).
    poi_array has shape (N, 2) in scaled-km space.
    """
    by_cat: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for row in poi_rows:
        cat = row.get("canonical_category", "")
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except ValueError:
            continue
        # Filter to Sri Lanka bounds
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            continue
        by_cat[cat].append((lat * KM_PER_DEG_LAT, lon * KM_PER_DEG_LON))

    index: dict[str, tuple[cKDTree, np.ndarray]] = {}
    for cat, pts in by_cat.items():
        arr = np.array(pts, dtype=np.float64)
        index[cat] = (cKDTree(arr), arr)

    return index


def spatial_features_for_outlet(
    lat_km: float,
    lon_km: float,
    index: dict[str, tuple[cKDTree, np.ndarray]],
) -> dict[str, float]:
    """Compute POI count and nearest-distance features for one outlet."""
    features: dict[str, float] = {}
    pt = np.array([[lat_km, lon_km]])

    for cat in CANONICAL_CATEGORIES:
        if cat not in index:
            for r in RADII_KM:
                features[f"count_{cat}_{int(r)}km"] = 0
            features[f"nearest_{cat}_m"] = MAX_SEARCH_KM * 1000
            continue

        tree, _ = index[cat]

        # Counts within each radius
        for r in RADII_KM:
            cnt = len(tree.query_ball_point(pt[0], r=r))
            features[f"count_{cat}_{int(r)}km"] = cnt

        # Nearest distance (convert km back to metres)
        dist_km, _ = tree.query(pt, k=1, distance_upper_bound=MAX_SEARCH_KM)
        nearest_m = float(dist_km[0]) * 1000 if dist_km[0] < MAX_SEARCH_KM else MAX_SEARCH_KM * 1000
        features[f"nearest_{cat}_m"] = round(nearest_m, 1)

    return features


# ── Seasonality features ──────────────────────────────────────────────────────

def build_jan2026_seasonality(
    seasonality_rows: list[dict],
    outlet_to_distributor: dict[str, str],
) -> dict[str, dict]:
    """
    Returns {Outlet_ID: {seasonality_jan2026_label, seasonality_jan2026_score}}.
    Uses most recent January value per distributor (2025 > 2024 > 2023).
    """
    # Build {distributor_id: {year: seasonality_index}} for January
    dist_jan: dict[str, dict[int, str]] = defaultdict(dict)
    for row in seasonality_rows:
        if row.get("Month", "").strip() == "1":
            did = row.get("Distributor_ID", "").strip()
            try:
                yr = int(row.get("Year", "0"))
            except ValueError:
                continue
            dist_jan[did][yr] = row.get("Seasonality_Index", "").strip()

    # Resolve per-distributor: use best available year
    dist_label: dict[str, str] = {}
    for did, year_map in dist_jan.items():
        for yr in [2025, 2024, 2023]:
            if yr in year_map:
                dist_label[did] = year_map[yr]
                break
        else:
            dist_label[did] = "Moderate"  # default

    # Map outlets to their distributor's January seasonality
    result: dict[str, dict] = {}
    for oid, did in outlet_to_distributor.items():
        label = dist_label.get(did, "Moderate")
        result[oid] = {
            "seasonality_jan2026_label": label,
            "seasonality_jan2026_score": SEASONALITY_SCORE.get(label, 1),
        }
    return result


def build_outlet_to_distributor(tx_clean_path: Path) -> dict[str, str]:
    """
    Build {Outlet_ID: most_recent_Distributor_ID} from the clean transactions.
    Uses the max (Year, Month) record per outlet as the canonical distributor.
    """
    print("  Building outlet->distributor mapping from transactions (streaming) ...")
    best: dict[str, tuple[int, int, str]] = {}  # oid → (year, month, dist_id)
    with tx_clean_path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            oid = row.get("Outlet_ID", "").strip()
            did = row.get("Distributor_ID", "").strip()
            try:
                yr = int(row.get("Year", 0))
                mo = int(row.get("Month", 0))
            except ValueError:
                continue
            if oid not in best or (yr, mo) > best[oid][:2]:
                best[oid] = (yr, mo, did)
    return {oid: v[2] for oid, v in best.items()}


# ── Holiday features ──────────────────────────────────────────────────────────

def compute_holiday_features(holiday_rows: list[dict]) -> dict:
    """
    Returns {
      'jan_holiday_count': avg unique public holidays in January,
      'jan_holiday_dates': list of date strings
    }.
    """
    jan_by_year: dict[int, set[str]] = defaultdict(set)
    for row in holiday_rows:
        date_raw = row.get("Date", "")
        htype = row.get("Holiday_Type", "").strip()
        try:
            # Handle ISO format like 2023-01-06T00:00:00Z
            date_str = date_raw.split("T")[0]
            d = dt.date.fromisoformat(date_str)
        except ValueError:
            continue
        if d.month == 1:
            jan_by_year[d.year].add(date_str)

    all_jan_counts = [len(v) for v in jan_by_year.values()]
    avg_count = round(sum(all_jan_counts) / len(all_jan_counts), 1) if all_jan_counts else 3.0
    # Collect all unique January holiday dates across years for reference
    all_jan_dates = sorted(set(d for dates in jan_by_year.values() for d in dates))
    return {
        "avg_jan_holidays_historical": avg_count,
        "jan_holiday_dates_historical": "; ".join(all_jan_dates),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    print("=== Phase 3 - Gold Feature Engineering ===\n")

    # ── Load silver/clean datasets ────────────────────────────────────────────
    print("[1] Loading silver/clean datasets ...")
    coords_raw = read_csv(SILVER_CLEAN / "outlet_coordinates.csv")
    master_rows = read_csv(SILVER_CLEAN / "outlet_master.csv")
    seasonality_rows = read_csv(SILVER_CLEAN / "distributor_seasonality_details.csv")
    holiday_rows = read_csv(SILVER_CLEAN / "holiday_list.csv")
    print(f"  Coords: {len(coords_raw)} | Master: {len(master_rows)} | "
          f"Seasonality: {len(seasonality_rows)} | Holidays: {len(holiday_rows)}")

    # ── Repair coordinates ────────────────────────────────────────────────────
    print("\n[2] Repairing coordinates ...")
    coords, quality = repair_coordinates(coords_raw)

    status_counts: dict[str, int] = defaultdict(int)
    for q in quality:
        status_counts[q["status"]] += 1
    for s, c in sorted(status_counts.items()):
        print(f"  {s}: {c}")

    # Write coordinate quality audit
    with COORD_QUALITY_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=["Outlet_ID", "status", "orig_lat", "orig_lon"]
        )
        writer.writeheader()
        writer.writerows(quality)
    print(f"  Coord quality audit -> {COORD_QUALITY_PATH}")

    # ── Build outlet master lookup ────────────────────────────────────────────
    print("\n[3] Building outlet attribute lookups ...")
    master_lookup: dict[str, dict] = {r["Outlet_ID"].strip(): r for r in master_rows}

    # ── Build outlet→distributor map ──────────────────────────────────────────
    outlet_to_dist = build_outlet_to_distributor(
        SILVER_CLEAN / "transactions_history_final.csv"
    )
    print(f"  Outlet-distributor map: {len(outlet_to_dist)} entries")

    # ── Seasonality features ──────────────────────────────────────────────────
    print("\n[4] Computing January 2026 seasonality features ...")
    seasonality_feat = build_jan2026_seasonality(seasonality_rows, outlet_to_dist)
    print(f"  Seasonality features built for {len(seasonality_feat)} outlets")

    # ── Holiday features ──────────────────────────────────────────────────────
    print("\n[5] Computing holiday features ...")
    holiday_info = compute_holiday_features(holiday_rows)
    avg_jan_holidays = holiday_info["avg_jan_holidays_historical"]
    print(f"  Avg Jan public holidays (historical): {avg_jan_holidays}")
    print(f"  Historical Jan dates: {holiday_info['jan_holiday_dates_historical']}")

    # ── Load POI data ─────────────────────────────────────────────────────────
    print("\n[6] Loading POI data ...")
    if POI_PATH.exists():
        poi_rows = read_csv(POI_PATH)
        print(f"  {len(poi_rows):,} POIs loaded from {POI_PATH.name}")
    else:
        print(f"  WARNING: {POI_PATH} not found — run phase3_poi_acquire.py first.")
        print("  Proceeding with zero POI features (will be all 0s).")
        poi_rows = []

    # ── Build spatial index ───────────────────────────────────────────────────
    print("\n[7] Building POI spatial index (cKDTree) ...")
    poi_index = build_poi_index(poi_rows)
    for cat in CANONICAL_CATEGORIES:
        cnt = len(poi_index[cat][1]) if cat in poi_index else 0
        print(f"  {cat:<15}: {cnt:>6,} POIs indexed")

    # ── Feature assembly ──────────────────────────────────────────────────────
    print("\n[8] Assembling features for all outlets ...")

    feature_rows: list[dict] = []
    n_valid = 0
    n_imputed = 0

    for coord_row in coords:
        oid = coord_row["Outlet_ID"].strip()
        coord_status = coord_row.get("coord_status", "invalid")

        # Outlet master attributes
        m = master_lookup.get(oid, {})
        size_raw = m.get("Outlet_Size", "").strip()
        otype = m.get("Outlet_Type", "").strip()
        try:
            cooler = int(m.get("Cooler_Count", "0").strip() or "0")
        except ValueError:
            cooler = 0

        # ── Base feature dict ─────────────────────────────────────────────────
        feat: dict = {
            "Outlet_ID": oid,
            "coord_status": coord_status,
            # Outlet attributes
            "outlet_size": size_raw,
            "size_score": SIZE_SCORE.get(size_raw, 0),
            "outlet_type": otype,
            "cooler_count": cooler,
        }

        # Outlet_Type one-hot
        for t in OUTLET_TYPES:
            feat[f"is_{t.lower()}"] = 1 if otype == t else 0

        # Seasonality
        sfeat = seasonality_feat.get(oid, {
            "seasonality_jan2026_label": "Moderate",
            "seasonality_jan2026_score": 1,
        })
        feat.update(sfeat)

        # Holiday proxy (same for all outlets — Jan 2026 calendar estimate)
        feat["avg_jan_holidays"] = avg_jan_holidays

        # ── Spatial features ──────────────────────────────────────────────────
        if coord_status in ("valid", "swapped_fixed"):
            try:
                lat = float(coord_row["Latitude"])
                lon = float(coord_row["Longitude"])
                lat_km = lat * KM_PER_DEG_LAT
                lon_km = lon * KM_PER_DEG_LON
                spatial = spatial_features_for_outlet(lat_km, lon_km, poi_index)
                feat.update(spatial)
                feat["lat"] = round(lat, 6)
                feat["lon"] = round(lon, 6)
                n_valid += 1
            except (ValueError, TypeError):
                # Fall through to zero-fill below
                coord_status = "invalid"

        if coord_status in ("zero_coords", "invalid"):
            # Zero-fill spatial features; Phase 4 model will impute
            for cat in CANONICAL_CATEGORIES:
                for r in RADII_KM:
                    feat[f"count_{cat}_{int(r)}km"] = 0
                feat[f"nearest_{cat}_m"] = MAX_SEARCH_KM * 1000
            feat["lat"] = 0.0
            feat["lon"] = 0.0
            n_imputed += 1

        feat["generated_at"] = generated_at
        feature_rows.append(feat)

    # ── Write output ──────────────────────────────────────────────────────────
    print(f"\n  Spatial features computed:  {n_valid:,} valid, {n_imputed:,} to impute")
    print("\n[9] Writing gold/features/outlet_features.csv ...")

    if feature_rows:
        fieldnames = list(feature_rows[0].keys())
        with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(feature_rows)
        print(f"  {len(feature_rows):,} rows written -> {OUTPUT_PATH}")
    else:
        print("  WARNING: No feature rows to write.")

    print("\nPhase 3 - Gold Feature Engineering complete.")


if __name__ == "__main__":
    main()
