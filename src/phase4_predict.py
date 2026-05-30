"""
phase4_predict.py — Unified ensemble prediction with competition adjustment
==============================================================================
Workstream 2 pipeline (single source of truth for submission):

  1. K-Means base ceiling (pre-Jan) from predictions_raw.base_ceiling
  2. QR raw ceiling (pre-Jan) from qr_predictions.qr_raw_ceiling
  3. base_ensemble = max(kmeans_base, qr_raw)
  4. Competition adjustment on pre-Jan ensemble:
       saturation_penalty = 1 - gamma * norm(density)
       isolation_boost    = 1 + delta * (1 - norm(density))
       adjusted_ceiling   = base_ensemble * penalty * boost
  5. Final:
       prediction = max(adjusted_ceiling * jan_factor, own_max_vol, 1.0)
  6. Cooler soft floor (cooler-limited outlets):
       prediction = max(prediction, replenishment_cap * 0.8) when cooler_count > 0

Outputs: gold/predictions/predictions_final.csv
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
STATS_PATH = ROOT / "gold" / "features" / "outlet_stats.csv"
FEAT_PATH = ROOT / "gold" / "features" / "outlet_features.csv"
KM_PATH = ROOT / "gold" / "predictions" / "predictions_raw.csv"
QR_PATH = ROOT / "gold" / "predictions" / "qr_predictions.csv"
OUT_PATH = ROOT / "gold" / "predictions" / "predictions_final.csv"

GAMMA = 0.20
DELTA = 0.10
FLOOR = 1.0
COOLER_LITERS_PER_CYCLE = 50.0
CYCLES_PER_MONTH = 4
COOLER_FLOOR_RATIO = 0.8


def read_csv_dict(path: Path) -> dict[str, dict]:
    with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        return {r["Outlet_ID"].strip(): r for r in csv.DictReader(fh)}


def main() -> None:
    print("=== Phase 4 - Unified Ensemble Prediction (Workstream 2) ===\n")

    if not KM_PATH.exists():
        print(f"  ERROR: Run phase4_model.py first ({KM_PATH})")
        sys.exit(1)
    if not QR_PATH.exists():
        print(f"  ERROR: Run phase4_quantile.py first ({QR_PATH})")
        sys.exit(1)

    stats = read_csv_dict(STATS_PATH)
    feats = read_csv_dict(FEAT_PATH)
    kmeans = read_csv_dict(KM_PATH)
    qr = read_csv_dict(QR_PATH)
    outlet_ids = sorted(feats.keys())
    print(f"  Outlets: {len(outlet_ids):,}")

    density_z = []
    for oid in outlet_ids:
        try:
            density_z.append(float(feats[oid].get("competitor_density_z", 0) or 0))
        except ValueError:
            density_z.append(0.0)
    arr = np.array(density_z, dtype=np.float64)
    z_norm = ((arr - arr.mean()) / (arr.std() or 1.0)).tolist()
    z_min, z_max = min(z_norm), max(z_norm)
    z_span = z_max - z_min if z_max > z_min else 1.0

    rows = []
    n_cooler_floor = 0
    for i, oid in enumerate(outlet_ids):
        s = stats.get(oid, {})
        f = feats.get(oid, {})
        km = kmeans.get(oid, {})
        q = qr.get(oid, {})

        kmeans_base = float(km.get("base_ceiling", 0) or 0)
        qr_raw = float(q.get("qr_raw_ceiling", 0) or 0)
        base_ensemble = max(kmeans_base, qr_raw)

        own_max = float(s.get("max_monthly_vol", 0) or 0)
        jan_factor = float(km.get("jan_factor", 1.0) or 1.0)
        cluster_id = km.get("cluster_id", "")
        cluster_ceil = float(km.get("cluster_ceiling", 0) or 0)

        norm_d = (z_norm[i] - z_min) / z_span
        sat_penalty = 1.0 - GAMMA * norm_d
        iso_boost = 1.0 + DELTA * (1.0 - norm_d)
        adjustment = sat_penalty * iso_boost
        adjusted_ceiling = base_ensemble * adjustment

        prediction = max(adjusted_ceiling * jan_factor, own_max, FLOOR)

        try:
            cooler = int(f.get("cooler_count", 0) or 0)
        except ValueError:
            cooler = 0
        replenishment_cap = cooler * COOLER_LITERS_PER_CYCLE * CYCLES_PER_MONTH
        cooler_floor_applied = 0
        if cooler > 0:
            cooler_floor = replenishment_cap * COOLER_FLOOR_RATIO
            if prediction < cooler_floor:
                prediction = max(cooler_floor, own_max, FLOOR)
                cooler_floor_applied = 1
                n_cooler_floor += 1

        dominant = q.get("dominant_method", "kmeans")
        if qr_raw > kmeans_base:
            dominant = "quantile_reg"

        try:
            gap = max(prediction - float(s.get("recent_3m_avg", 0) or 0), 0)
        except ValueError:
            gap = 0.0

        rows.append({
            "Outlet_ID": oid,
            "cluster_id": cluster_id,
            "cluster_ceiling": round(cluster_ceil, 4),
            "kmeans_ceiling": round(kmeans_base, 4),
            "qr_ceiling": round(qr_raw, 4),
            "base_ensemble": round(base_ensemble, 4),
            "ensemble_raw": round(base_ensemble, 4),
            "competitor_density_index": f.get("competitor_density_index", 0),
            "competitor_density_z": f.get("competitor_density_z", 0),
            "market_saturation_label": f.get("market_saturation_label", ""),
            "adjustment_factor": round(adjustment, 4),
            "adjusted_ceiling": round(adjusted_ceiling, 4),
            "jan_factor": round(jan_factor, 4),
            "own_max_vol": round(own_max, 4),
            "replenishment_cap": round(replenishment_cap, 4),
            "cooler_floor_applied": cooler_floor_applied,
            "gap_liters": round(gap, 4),
            "dominant_method": dominant,
            "province": f.get("province", ""),
            "distributor_id": f.get("distributor_id", ""),
            "Maximum_Monthly_Liters": round(prediction, 4),
        })

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    preds = [r["Maximum_Monthly_Liters"] for r in rows]
    below_own = sum(
        1 for r in rows
        if r["Maximum_Monthly_Liters"] < r["own_max_vol"] - 1e-6
    )
    print(f"  Predictions written -> {OUT_PATH}")
    print(f"  Median: {sorted(preds)[len(preds)//2]:,.1f} L")
    print(f"  Mean:   {sum(preds)/len(preds):,.1f} L")
    print(f"  Below own_max_vol: {below_own} (expected 0)")
    print(f"  Cooler soft floor applied: {n_cooler_floor:,} outlets")
    print("\nPhase 4 unified prediction complete.")


if __name__ == "__main__":
    main()
