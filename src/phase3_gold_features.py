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

Spatial Feature Engineering (Round 2)
--------------------------------------
  Primary: exponential decay influence per POI category (spatial_decay.py)
    decay_<cat>  — sum exp(-beta * d) within 10 km
    decay_total  — sum of category decay influences
  Legacy (A/B): count_<cat>_1km/3km retained for comparison
  Competition: competitors_500m/1km, density index, DBSCAN zones (spatial_competition.py)
  Province/distributor join via metadata/distributor_province_map.csv

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
import sys
import datetime as dt
from collections import defaultdict
from pathlib import Path

from spatial_competition import (
    DEFAULT_COMPETITION,
    build_outlet_tree,
    build_province_imputation_medians,
    compute_competition_features,
    impute_competition_from_medians,
    summarize_competition,
)
from spatial_decay import (
    CANONICAL_CATEGORIES,
    KM_PER_DEG_LAT,
    KM_PER_DEG_LON,
    LAT_MAX,
    LAT_MIN,
    LON_MAX,
    LON_MIN,
    MAX_SEARCH_KM,
    RADII_KM,
    build_poi_index,
    impute_decay_from_medians,
    impute_legacy_from_medians,
    spatial_features_for_outlet,
    summarize_decay,
    zero_spatial_features,
)

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
SPATIAL_COMPARE_PATH = ROOT / "metadata" / "spatial_feature_comparison.csv"
GOLD_SPATIAL_REPORT_PATH = ROOT / "metadata" / "gold_spatial_report.csv"

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

    # ── Competition features (outlet-to-outlet) ───────────────────────────────
    print("\n[8] Computing competitive catchment density ...")
    outlet_coord_list: list[tuple[str, float, float]] = []
    for coord_row in coords:
        oid = coord_row["Outlet_ID"].strip()
        status = coord_row.get("coord_status", "invalid")
        if status in ("valid", "swapped_fixed"):
            try:
                lat = float(coord_row["Latitude"])
                lon = float(coord_row["Longitude"])
                outlet_coord_list.append((oid, lat, lon))
            except (ValueError, TypeError):
                pass

    all_oids = [c["Outlet_ID"].strip() for c in coords]
    if outlet_coord_list:
        _, _, scaled_arr = build_outlet_tree(outlet_coord_list, KM_PER_DEG_LAT, KM_PER_DEG_LON)
        oid_order = [x[0] for x in outlet_coord_list]
        competition = compute_competition_features(oid_order, scaled_arr)
        competition_full = {
            oid: competition.get(oid, dict(DEFAULT_COMPETITION))
            for oid in all_oids
        }
        print(f"  Competition features for {len(outlet_coord_list):,} geocoded outlets")
    else:
        competition_full = {oid: dict(DEFAULT_COMPETITION) for oid in all_oids}

    # ── Province mapping ──────────────────────────────────────────────────────
    province_map_path = ROOT / "metadata" / "distributor_province_map.csv"
    dist_province: dict[str, str] = {}
    if province_map_path.exists():
        for row in read_csv(province_map_path):
            dist_province[row["Distributor_ID"].strip()] = row["Province"].strip()

    # ── Feature assembly ──────────────────────────────────────────────────────
    print("\n[9] Assembling features for all outlets ...")

    feature_rows: list[dict] = []
    n_valid = 0
    n_imputed = 0
    comparison_rows: list[dict] = []

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

        # Distributor / province
        did = outlet_to_dist.get(oid, "")
        feat["distributor_id"] = did
        feat["province"] = dist_province.get(did, "Unknown")

        # Competition features (geocoded; imputed later for invalid coords)
        if coord_status in ("valid", "swapped_fixed"):
            feat.update(competition_full.get(oid, dict(DEFAULT_COMPETITION)))
        else:
            feat.update(dict(DEFAULT_COMPETITION))

        # ── Spatial features ──────────────────────────────────────────────────
        if coord_status in ("valid", "swapped_fixed"):
            try:
                lat = float(coord_row["Latitude"])
                lon = float(coord_row["Longitude"])
                lat_km = lat * KM_PER_DEG_LAT
                lon_km = lon * KM_PER_DEG_LON
                spatial_legacy, spatial_decay = spatial_features_for_outlet(
                    lat_km, lon_km, poi_index, max_search_km=MAX_SEARCH_KM
                )
                feat.update(spatial_legacy)
                for cat in CANONICAL_CATEGORIES:
                    feat[f"decay_{cat}"] = spatial_decay.get(f"decay_{cat}", 0.0)
                    if f"nearest_{cat}_m" in spatial_decay:
                        feat[f"nearest_{cat}_m"] = spatial_decay[f"nearest_{cat}_m"]
                feat["decay_total"] = spatial_decay.get("decay_total", 0.0)
                feat["lat"] = round(lat, 6)
                feat["lon"] = round(lon, 6)
                n_valid += 1
                comp_row: dict = {"Outlet_ID": oid}
                for cat in CANONICAL_CATEGORIES:
                    comp_row[f"legacy_{cat}_1km"] = spatial_legacy.get(f"count_{cat}_1km", 0)
                    comp_row[f"legacy_{cat}_3km"] = spatial_legacy.get(f"count_{cat}_3km", 0)
                    comp_row[f"decay_{cat}"] = spatial_decay.get(f"decay_{cat}", 0)
                comp_row["competitors_1km"] = feat.get("competitors_1km", 0)
                comp_row["decay_total"] = feat.get("decay_total", 0)
                comparison_rows.append(comp_row)
            except (ValueError, TypeError):
                coord_status = "invalid"

        if coord_status in ("zero_coords", "invalid"):
            feat.update(zero_spatial_features())
            feat["coord_status"] = coord_status
            n_imputed += 1

        feat["generated_at"] = generated_at
        feature_rows.append(feat)

    # ── Impute invalid-coordinate outlets from province medians ─────────────
    print("\n[9b] Imputing spatial/competition features for invalid-coordinate outlets ...")
    decay_keys = [f"decay_{c}" for c in CANONICAL_CATEGORIES] + ["decay_total"]
    comp_keys = [
        "competitors_500m", "competitors_1km",
        "competitor_density_index", "competitor_density_z",
        "dbscan_zone_id", "dbscan_is_core",
    ]
    legacy_keys = [
        f"count_{c}_{int(r)}km"
        for c in CANONICAL_CATEGORIES
        for r in RADII_KM
    ] + [f"nearest_{c}_m" for c in CANONICAL_CATEGORIES]
    prov_decay, global_decay = build_province_imputation_medians(feature_rows, decay_keys)
    prov_legacy, global_legacy = build_province_imputation_medians(
        feature_rows, legacy_keys
    )
    prov_comp, global_comp = build_province_imputation_medians(feature_rows, comp_keys)

    n_imputed_applied = 0
    for feat in feature_rows:
        if feat.get("coord_status") not in ("zero_coords", "invalid"):
            continue
        prov = feat.get("province", "Unknown")
        decay_med = prov_decay.get(prov) or global_decay
        legacy_med = prov_legacy.get(prov) or global_legacy
        imputed_decay = impute_decay_from_medians(decay_med)
        imputed_legacy = impute_legacy_from_medians(legacy_med)
        for k, v in imputed_decay.items():
            if k not in ("lat", "lon"):
                feat[k] = v
        for k, v in imputed_legacy.items():
            feat[k] = v
        feat.update(impute_competition_from_medians(prov, prov_comp, global_comp))
        feat["spatial_imputed"] = 1
        n_imputed_applied += 1

    for feat in feature_rows:
        if feat.get("coord_status") in ("valid", "swapped_fixed"):
            feat["spatial_imputed"] = 0

    print(f"  Province-median imputation applied to {n_imputed_applied:,} outlets")

    # ── Write output ──────────────────────────────────────────────────────────
    print(f"\n  Spatial features computed:  {n_valid:,} valid, {n_imputed:,} to impute")

    # Spatial feature A/B comparison (all geocoded outlets, all categories)
    if comparison_rows:
        with SPATIAL_COMPARE_PATH.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(comparison_rows[0].keys()))
            writer.writeheader()
            writer.writerows(comparison_rows)
        print(f"  Spatial A/B comparison -> {SPATIAL_COMPARE_PATH} ({len(comparison_rows):,} rows)")

    # Gold spatial summary report
    report_rows = summarize_decay(feature_rows) + summarize_competition(feature_rows)
    if report_rows:
        # Normalize column sets for combined report
        fieldnames = [
            "feature_group", "feature", "n_outlets", "n_nonzero", "pct_nonzero",
            "mean", "median", "p90", "max",
        ]
        with GOLD_SPATIAL_REPORT_PATH.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(report_rows)
        print(f"  Gold spatial report -> {GOLD_SPATIAL_REPORT_PATH}")

    print("\n[10] Writing gold/features/outlet_features.csv ...")

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
