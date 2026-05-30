"""
modeling_features.py — Shared feature columns for Phase 4 modeling (Workstream 2)
==================================================================================
Round 2 uses exponential-decay POI features from the gold layer instead of
legacy fixed-radius counts for K-Means clustering and quantile regression.
"""
from __future__ import annotations

# Volume profile (outlet_stats)
VOLUME_FEATURE_COLS = [
    "mean_monthly_vol",
    "p90_monthly_vol",
    "std_monthly_vol",
    "recent_3m_avg",
    "jan_avg_vol",
]

# Outlet attributes (outlet_features)
OUTLET_ATTRIBUTE_COLS = [
    "size_score",
    "cooler_count",
]

# Round 2 decay POI influence (outlet_features) — replaces count_*_3km in modeling
DECAY_POI_COLS = [
    "decay_transport",
    "decay_food",
    "decay_worship",
    "decay_education",
    "decay_market",
    "decay_total",
]

# Legacy counts retained for reference / audits only (not used in Round 2 modeling)
LEGACY_POI_COUNT_COLS = [
    "count_worship_3km",
    "count_education_3km",
    "count_transport_3km",
    "count_market_3km",
    "count_food_3km",
]

CLUSTER_FEATURE_COLS = VOLUME_FEATURE_COLS + OUTLET_ATTRIBUTE_COLS + DECAY_POI_COLS
QR_FEATURE_COLS = CLUSTER_FEATURE_COLS
