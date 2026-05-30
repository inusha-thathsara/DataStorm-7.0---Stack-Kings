"""
xai_feature_drivers.py — Per-outlet model drivers for XAI (PDF §4.1)
=====================================================================
Computes QR coefficient contributions, K-Means peer signal, and competition
adjustment breakdown for export to the web app and LLM prompts.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from modeling_features import QR_FEATURE_COLS

ROOT = Path(__file__).resolve().parents[1]
QR_MODEL_PATH = ROOT / "metadata" / "qr_model.json"

GAMMA = 0.20
DELTA = 0.10

FEATURE_LABELS: dict[str, str] = {
    "mean_monthly_vol": "Historical mean monthly volume",
    "p90_monthly_vol": "Historical 90th percentile volume",
    "std_monthly_vol": "Volume variability (std dev)",
    "recent_3m_avg": "Recent 3-month average volume",
    "jan_avg_vol": "January historical average",
    "size_score": "Outlet size score",
    "cooler_count": "On-premise cooler count",
    "decay_transport": "Transport POI decay influence",
    "decay_food": "Food-service POI decay influence",
    "decay_worship": "Worship POI decay influence",
    "decay_education": "Education POI decay influence",
    "decay_market": "Market POI decay influence",
    "decay_total": "Total POI decay influence",
}


def _float(row: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(row.get(key, default) or default)
    except (TypeError, ValueError):
        return default


def _feature_vector(stats: dict, feats: dict) -> np.ndarray:
    row = []
    for col in QR_FEATURE_COLS:
        try:
            row.append(float(stats.get(col) or feats.get(col) or 0))
        except ValueError:
            row.append(0.0)
    return np.array(row, dtype=np.float64)


def load_qr_model(path: Path = QR_MODEL_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def compute_norm_density_map(feats: dict[str, dict]) -> dict[str, float]:
    """Match phase4_predict.py min-max normalization on competitor_density_z."""
    outlet_ids = sorted(feats.keys())
    z_vals = [_float(feats[oid], "competitor_density_z") for oid in outlet_ids]
    arr = np.array(z_vals, dtype=np.float64)
    z_norm = (arr - arr.mean()) / (arr.std() or 1.0)
    z_min, z_max = float(z_norm.min()), float(z_norm.max())
    span = z_max - z_min if z_max > z_min else 1.0
    return {oid: float((z_norm[i] - z_min) / span) for i, oid in enumerate(outlet_ids)}


def qr_top_drivers(
    stats: dict,
    feats: dict,
    qr_model: dict[str, Any],
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """Standardized QR contributions: beta_j * z_j (liters scale on training target)."""
    x = _feature_vector(stats, feats)
    mu = np.array(qr_model["mu"], dtype=np.float64)
    sd = np.array(qr_model["sd"], dtype=np.float64)
    sd[sd == 0] = 1.0
    beta = np.array(qr_model["beta"], dtype=np.float64)
    z = (x - mu) / sd

    rows: list[dict[str, Any]] = []
    for i, col in enumerate(QR_FEATURE_COLS):
        weight = float(beta[i + 1])
        contrib = float(weight * z[i])
        rows.append({
            "feature": col,
            "label": FEATURE_LABELS.get(col, col),
            "weight": round(weight, 4),
            "standardizedValue": round(float(z[i]), 4),
            "contributionLiters": round(contrib, 2),
            "direction": "up" if contrib >= 0 else "down",
        })
    rows.sort(key=lambda r: abs(r["contributionLiters"]), reverse=True)
    return rows[:top_n]


def build_model_drivers(
    oid: str,
    stats: dict,
    feats: dict,
    pred: dict,
    qr_model: dict[str, Any] | None,
    norm_density: float,
) -> dict[str, Any]:
    kmeans_ceiling = _float(pred, "kmeans_ceiling")
    qr_ceiling = _float(pred, "qr_ceiling")
    base_ensemble = _float(pred, "base_ensemble")
    adjustment = _float(pred, "adjustment_factor", 1.0)
    sat_penalty = round(1.0 - GAMMA * norm_density, 4)
    iso_boost = round(1.0 + DELTA * (1.0 - norm_density), 4)
    dominant = pred.get("dominant_method", "kmeans")
    winning = "quantile_reg" if qr_ceiling > kmeans_ceiling else "kmeans"

    drivers: dict[str, Any] = {
        "dominantMethod": dominant,
        "winningCeilingMethod": winning,
        "kmeansCeilingLiters": round(kmeans_ceiling, 2),
        "qrCeilingLiters": round(qr_ceiling, 2),
        "baseEnsembleLiters": round(base_ensemble, 2),
        "competition": {
            "normalizedDensity": round(norm_density, 4),
            "saturationPenalty": sat_penalty,
            "isolationBoost": iso_boost,
            "combinedAdjustmentFactor": round(adjustment, 4),
            "gamma": GAMMA,
            "delta": DELTA,
        },
        "kmeansPeerSignal": (
            f"Cluster {pred.get('cluster_id', '—')} peer ceiling "
            f"{_float(pred, 'cluster_ceiling'):.1f} L (90th pct of lookalike outlets)"
        ),
        "qrTopDrivers": qr_top_drivers(stats, feats, qr_model) if qr_model else [],
        "qrModelTau": qr_model.get("tau") if qr_model else None,
    }
    if qr_model and drivers["qrTopDrivers"]:
        drivers["qrInterceptLiters"] = round(float(qr_model["beta"][0]), 2)
    return drivers
