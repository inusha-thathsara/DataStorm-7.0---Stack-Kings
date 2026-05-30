"""
spatial_competition.py — Competitive catchment density features
===============================================================
Outlet-to-outlet spatial analysis: competitor counts, density index,
geographic DBSCAN zones, market saturation labels.
"""
from __future__ import annotations

import math
from collections import defaultdict
from statistics import median

import numpy as np
from scipy.spatial import cKDTree

RADIUS_500M_KM = 0.5
RADIUS_1KM_KM = 1.0
DBSCAN_EPS_KM = 0.5  # ~500 m at 7°N in km-scaled space
DBSCAN_MIN_SAMPLES = 3

COMPETITION_NUMERIC_COLS = [
    "competitors_500m", "competitors_1km",
    "competitor_density_index", "competitor_density_z",
    "dbscan_zone_id", "dbscan_is_core",
]

DEFAULT_COMPETITION = {
    "competitors_500m": 0,
    "competitors_1km": 0,
    "competitor_density_index": 0.0,
    "competitor_density_z": 0.0,
    "dbscan_zone_id": -1,
    "dbscan_is_core": 0,
    "market_saturation_label": "low",
}


def build_outlet_tree(
    outlet_coords: list[tuple[str, float, float]],
    km_per_deg_lat: float,
    km_per_deg_lon: float,
) -> tuple[cKDTree, list[str], np.ndarray]:
    ids: list[str] = []
    pts: list[list[float]] = []
    for oid, lat, lon in outlet_coords:
        ids.append(oid)
        pts.append([lat * km_per_deg_lat, lon * km_per_deg_lon])
    arr = np.array(pts, dtype=np.float64)
    return cKDTree(arr), ids, arr


def count_neighbors(
    tree: cKDTree,
    pt: np.ndarray,
    radius_km: float,
    exclude_self: bool = True,
) -> int:
    idxs = tree.query_ball_point(pt, r=radius_km)
    if exclude_self and len(idxs) > 0:
        return max(0, len(idxs) - 1)
    return len(idxs)


def geographic_dbscan(
    coords_km: np.ndarray,
    eps_km: float = DBSCAN_EPS_KM,
    min_samples: int = DBSCAN_MIN_SAMPLES,
) -> tuple[np.ndarray, np.ndarray]:
    n = len(coords_km)
    labels = np.full(n, -1, dtype=np.int32)
    is_core = np.zeros(n, dtype=bool)
    tree = cKDTree(coords_km)
    cluster_id = 0

    for i in range(n):
        neighbors = tree.query_ball_point(coords_km[i], r=eps_km)
        is_core[i] = len(neighbors) >= min_samples

    visited = np.zeros(n, dtype=bool)

    for i in range(n):
        if visited[i] or not is_core[i]:
            continue
        queue = list(tree.query_ball_point(coords_km[i], r=eps_km))
        labels[i] = cluster_id
        visited[i] = True
        q = 0
        while q < len(queue):
            j = queue[q]
            q += 1
            if not visited[j]:
                visited[j] = True
                labels[j] = cluster_id
                if is_core[j]:
                    queue.extend(tree.query_ball_point(coords_km[j], r=eps_km))
            elif labels[j] == -1:
                labels[j] = cluster_id
        cluster_id += 1

    for i in range(n):
        if labels[i] == -1:
            neighbors = tree.query_ball_point(coords_km[i], r=eps_km)
            for j in neighbors:
                if labels[j] >= 0:
                    labels[i] = labels[j]
                    break

    return labels, is_core


def compute_competition_features(
    outlet_ids: list[str],
    coords_km: np.ndarray,
) -> dict[str, dict]:
    """Compute competitor density features for geocoded outlets."""
    n = len(outlet_ids)
    tree = cKDTree(coords_km)

    comp_500m = np.zeros(n, dtype=np.float64)
    comp_1km = np.zeros(n, dtype=np.float64)
    for i in range(n):
        comp_500m[i] = count_neighbors(tree, coords_km[i], RADIUS_500M_KM)
        comp_1km[i] = count_neighbors(tree, coords_km[i], RADIUS_1KM_KM)

    area_1km = math.pi * (RADIUS_1KM_KM ** 2)
    density_raw = comp_1km / area_1km

    mu, sd = float(density_raw.mean()), float(density_raw.std())
    sd = sd if sd > 0 else 1.0
    density_z = (density_raw - mu) / sd

    sub_labels, sub_core = geographic_dbscan(coords_km)

    sorted_d = sorted(density_raw.tolist())
    t33 = sorted_d[len(sorted_d) // 3]
    t67 = sorted_d[2 * len(sorted_d) // 3]

    result: dict[str, dict] = {}
    for i, oid in enumerate(outlet_ids):
        d = density_raw[i]
        if d <= t33:
            sat = "low"
        elif d <= t67:
            sat = "medium"
        else:
            sat = "high"

        result[oid] = {
            "competitors_500m": int(comp_500m[i]),
            "competitors_1km": int(comp_1km[i]),
            "competitor_density_index": round(float(density_raw[i]), 4),
            "competitor_density_z": round(float(density_z[i]), 4),
            "dbscan_zone_id": int(sub_labels[i]),
            "dbscan_is_core": int(sub_core[i]),
            "market_saturation_label": sat,
        }
    return result


def build_province_imputation_medians(
    feature_rows: list[dict],
    numeric_keys: list[str],
) -> tuple[dict[str, dict[str, float]], dict[str, float]]:
    """
    Province-level medians for imputing invalid-coordinate outlets.
    Returns (by_province medians, global fallback medians).
    """
    by_prov: dict[str, list[dict]] = defaultdict(list)
    for row in feature_rows:
        if row.get("coord_status") in ("valid", "swapped_fixed"):
            by_prov[row.get("province", "Unknown")].append(row)

    prov_medians: dict[str, dict[str, float]] = {}
    all_valid: list[dict] = []
    for prov, rows in by_prov.items():
        med: dict[str, float] = {}
        for key in numeric_keys:
            vals = [float(r[key]) for r in rows if r.get(key) not in (None, "")]
            med[key] = float(median(vals)) if vals else 0.0
        prov_medians[prov] = med
        all_valid.extend(rows)

    global_med: dict[str, float] = {}
    for key in numeric_keys:
        vals = [float(r[key]) for r in all_valid if r.get(key) not in (None, "")]
        global_med[key] = float(median(vals)) if vals else 0.0

    return prov_medians, global_med


def impute_competition_from_medians(
    province: str,
    prov_medians: dict[str, dict[str, float]],
    global_medians: dict[str, float],
) -> dict:
    med = prov_medians.get(province) or global_medians
    out = dict(DEFAULT_COMPETITION)
    for key in COMPETITION_NUMERIC_COLS:
        out[key] = med.get(key, 0.0)
        if key in ("competitors_500m", "competitors_1km", "dbscan_zone_id", "dbscan_is_core"):
            out[key] = int(round(out[key]))
    # Saturation label from imputed density index vs global tertiles — use medium default
    out["market_saturation_label"] = "medium"
    return out


def summarize_competition(feature_rows: list[dict]) -> list[dict]:
    """Summary stats for metadata/gold_spatial_report.csv."""
    valid = [r for r in feature_rows if r.get("coord_status") in ("valid", "swapped_fixed")]
    if not valid:
        return []

    def pct(vals, p):
        s = sorted(vals)
        k = (len(s) - 1) * p / 100
        lo, hi = int(k), min(int(k) + 1, len(s) - 1)
        return s[lo] + (k - lo) * (s[hi] - s[lo])

    rows = []
    for key in ["competitors_500m", "competitors_1km", "competitor_density_index"]:
        vals = [float(r[key]) for r in valid]
        n_nz = sum(1 for v in vals if v > 0)
        rows.append({
            "feature_group": "competition",
            "feature": key,
            "n_outlets": len(valid),
            "n_nonzero": n_nz,
            "pct_nonzero": round(100 * n_nz / len(valid), 2),
            "mean": round(sum(vals) / len(vals), 4),
            "median": round(pct(vals, 50), 4),
            "p90": round(pct(vals, 90), 4),
            "max": round(max(vals), 4),
        })

    sat_counts = defaultdict(int)
    for r in valid:
        sat_counts[r.get("market_saturation_label", "")] += 1
    for label, cnt in sorted(sat_counts.items()):
        rows.append({
            "feature_group": "competition",
            "feature": f"market_saturation_{label}",
            "n_outlets": cnt,
            "n_nonzero": cnt,
            "pct_nonzero": round(100 * cnt / len(valid), 2),
            "mean": "", "median": "", "p90": "", "max": "",
        })

    n_zones = len({r.get("dbscan_zone_id") for r in valid if int(r.get("dbscan_zone_id", -1)) >= 0})
    rows.append({
        "feature_group": "competition",
        "feature": "dbscan_zone_count",
        "n_outlets": n_zones,
        "n_nonzero": n_zones,
        "pct_nonzero": "",
        "mean": "", "median": "", "p90": "", "max": "",
    })
    return rows
