"""
spatial_decay.py — Exponential distance-decay POI influence features
====================================================================
For outlet i and POI j in category c:
    influence_ic = sum_j exp(-beta_c * d_ij)

Uses cKDTree ball queries within MAX_SEARCH_KM — no full N×M distance matrix.
Legacy fixed-radius counts (1 km / 3 km) retained for A/B comparison.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np
from scipy.spatial import cKDTree

# Sri Lanka valid bounds (same as phase3_gold_features)
LAT_MIN, LAT_MAX = 5.80, 10.0
LON_MIN, LON_MAX = 79.50, 82.0

LAT_CENTRE_RAD = math.radians(7.8)
KM_PER_DEG_LAT = 111.32
KM_PER_DEG_LON = 111.32 * math.cos(LAT_CENTRE_RAD)

RADII_KM = [1.0, 3.0]
MAX_SEARCH_KM = 10.0

# Beta per category (1/km) — higher = faster decay
DEFAULT_BETA: dict[str, float] = {
    "transport": 3.0,
    "food": 3.0,
    "education": 1.5,
    "worship": 1.5,
    "health": 2.0,
    "market": 2.0,
    "tourism": 2.0,
}

CANONICAL_CATEGORIES = [
    "education", "health", "transport",
    "market", "tourism", "food", "worship",
]


def build_poi_index(
    poi_rows: list[dict],
) -> dict[str, tuple[cKDTree, np.ndarray]]:
    """
    Returns canonical_category → (cKDTree, poi_array) in scaled-km space.
    """
    by_cat: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for row in poi_rows:
        cat = row.get("canonical_category", "")
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except (ValueError, TypeError):
            continue
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            continue
        by_cat[cat].append((lat * KM_PER_DEG_LAT, lon * KM_PER_DEG_LON))

    index: dict[str, tuple[cKDTree, np.ndarray]] = {}
    for cat, pts in by_cat.items():
        arr = np.array(pts, dtype=np.float64)
        index[cat] = (cKDTree(arr), arr)
    return index


def legacy_radius_features_for_outlet(
    lat_km: float,
    lon_km: float,
    index: dict[str, tuple[cKDTree, np.ndarray]],
) -> dict[str, float]:
    """Fixed-radius POI counts (legacy Round 1 features for A/B comparison)."""
    features: dict[str, float] = {}
    pt = np.array([[lat_km, lon_km]])

    for cat in CANONICAL_CATEGORIES:
        if cat not in index:
            for r in RADII_KM:
                features[f"count_{cat}_{int(r)}km"] = 0
            features[f"nearest_{cat}_m"] = MAX_SEARCH_KM * 1000
            continue

        tree, _ = index[cat]
        for r in RADII_KM:
            features[f"count_{cat}_{int(r)}km"] = len(tree.query_ball_point(pt[0], r=r))

        dist_km, _ = tree.query(pt, k=1, distance_upper_bound=MAX_SEARCH_KM)
        nearest_m = float(dist_km[0]) * 1000 if dist_km[0] < MAX_SEARCH_KM else MAX_SEARCH_KM * 1000
        features[f"nearest_{cat}_m"] = round(nearest_m, 1)

    return features


def decay_influence_for_outlet(
    lat_km: float,
    lon_km: float,
    index: dict[str, tuple[cKDTree, np.ndarray]],
    *,
    max_search_km: float = MAX_SEARCH_KM,
    beta_map: dict[str, float] | None = None,
) -> dict[str, float]:
    """Compute decay-weighted POI influence and nearest distance per category."""
    beta_map = beta_map or DEFAULT_BETA
    features: dict[str, float] = {}
    pt = np.array([lat_km, lon_km])
    decay_total = 0.0

    for cat in CANONICAL_CATEGORIES:
        beta = beta_map.get(cat, 2.0)
        if cat not in index:
            features[f"decay_{cat}"] = 0.0
            features[f"nearest_{cat}_m"] = max_search_km * 1000
            continue

        tree, _ = index[cat]
        idxs = tree.query_ball_point(pt, r=max_search_km)
        if not idxs:
            features[f"decay_{cat}"] = 0.0
            dist_km, _ = tree.query([pt], k=1, distance_upper_bound=max_search_km)
            nearest_m = float(dist_km[0]) * 1000 if dist_km[0] < max_search_km else max_search_km * 1000
            features[f"nearest_{cat}_m"] = round(nearest_m, 1)
            continue

        poi_pts = tree.data[idxs]
        diffs = poi_pts - pt
        dists_km = np.sqrt(np.sum(diffs ** 2, axis=1))
        influence = float(np.sum(np.exp(-beta * dists_km)))
        features[f"decay_{cat}"] = round(influence, 4)
        decay_total += influence

        nearest_m = float(np.min(dists_km)) * 1000
        features[f"nearest_{cat}_m"] = round(nearest_m, 1)

    features["decay_total"] = round(decay_total, 4)
    return features


def spatial_features_for_outlet(
    lat_km: float,
    lon_km: float,
    index: dict[str, tuple[cKDTree, np.ndarray]],
    *,
    max_search_km: float = MAX_SEARCH_KM,
    beta_map: dict[str, float] | None = None,
) -> tuple[dict[str, float], dict[str, float]]:
    """
    Returns (legacy_radius_features, decay_features) for one outlet.
    """
    legacy = legacy_radius_features_for_outlet(lat_km, lon_km, index)
    decay = decay_influence_for_outlet(
        lat_km, lon_km, index, max_search_km=max_search_km, beta_map=beta_map
    )
    return legacy, decay


def zero_spatial_features() -> dict[str, float]:
    """Zero-fill for outlets pending imputation."""
    feat: dict[str, float] = {}
    for cat in CANONICAL_CATEGORIES:
        for r in RADII_KM:
            feat[f"count_{cat}_{int(r)}km"] = 0
        feat[f"nearest_{cat}_m"] = MAX_SEARCH_KM * 1000
        feat[f"decay_{cat}"] = 0.0
    feat["decay_total"] = 0.0
    feat["lat"] = 0.0
    feat["lon"] = 0.0
    return feat


def summarize_decay(feature_rows: list[dict]) -> list[dict]:
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
    keys = [f"decay_{c}" for c in CANONICAL_CATEGORIES] + ["decay_total"]
    for key in keys:
        vals = [float(r.get(key, 0) or 0) for r in valid]
        n_nonzero = sum(1 for v in vals if v > 0)
        rows.append({
            "feature_group": "decay",
            "feature": key,
            "n_outlets": len(valid),
            "n_nonzero": n_nonzero,
            "pct_nonzero": round(100 * n_nonzero / len(valid), 2),
            "mean": round(sum(vals) / len(vals), 4),
            "median": round(pct(vals, 50), 4),
            "p90": round(pct(vals, 90), 4),
            "max": round(max(vals), 4),
        })

    # Legacy vs decay correlation proxy for transport
    legacy_t = [float(r.get("count_transport_3km", 0)) for r in valid]
    decay_t = [float(r.get("decay_transport", 0)) for r in valid]
    rows.append({
        "feature_group": "ab_comparison",
        "feature": "transport_legacy3km_vs_decay",
        "n_outlets": len(valid),
        "n_nonzero": sum(1 for v in decay_t if v > 0),
        "pct_nonzero": round(100 * sum(1 for v in decay_t if v > 0) / len(valid), 2),
        "mean": round(sum(legacy_t) / len(legacy_t), 4),
        "median": round(pct(decay_t, 50), 4),
        "p90": round(pct(decay_t, 90), 4),
        "max": round(max(decay_t), 4),
    })
    return rows


def impute_decay_from_medians(
    medians: dict[str, float],
) -> dict[str, float]:
    feat = zero_spatial_features()
    for cat in CANONICAL_CATEGORIES:
        feat[f"decay_{cat}"] = round(medians.get(f"decay_{cat}", 0.0), 4)
    feat["decay_total"] = round(medians.get("decay_total", 0.0), 4)
    return feat


def impute_legacy_from_medians(medians: dict[str, float]) -> dict[str, float]:
    """Province-median legacy disk counts + nearest distance for imputed outlets."""
    feat: dict[str, float] = {}
    for cat in CANONICAL_CATEGORIES:
        for r in RADII_KM:
            key = f"count_{cat}_{int(r)}km"
            feat[key] = int(round(medians.get(key, 0.0)))
        nearest_key = f"nearest_{cat}_m"
        feat[nearest_key] = round(
            medians.get(nearest_key, MAX_SEARCH_KM * 1000),
            1,
        )
    return feat
