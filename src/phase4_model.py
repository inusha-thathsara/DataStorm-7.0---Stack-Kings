"""
phase4_model.py  —  Censored Demand Ceiling Model
===================================================
Phase 4 / Step 8 (part 2):
  Builds a defensible January 2026 potential estimate for each outlet
  by treating observed historical volumes as right-censored lower bounds
  of true latent demand.

Methodology (documented for report)
-------------------------------------
  1. LOOKALIKE CLUSTERING (primary)
     - Cluster all 20,000 outlets into K=50 groups using K-Means on a
       feature vector combining volume profile + outlet attributes + POI
       density (scipy.cluster.vq, z-score normalized).
     - Within each cluster the 90th percentile of historical MAXIMUM monthly
       volume is the "unconstrained ceiling" — this is what peer outlets with
       fewer supply constraints have actually achieved.
     - Rationale: right-censoring depresses observed volumes for some outlets;
       the cluster ceiling reveals the latent demand ceiling for the group.

  2. OUTLET-LEVEL FLOOR PROTECTION
     - A prediction must never be below the outlet's own observed maximum
       (the ceiling is at least as high as what was already delivered).
     - base_ceiling = max(outlet_p90_vol * 1.05, cluster_ceiling)
       The 1.05 factor acknowledges that even the observed p90 may be censored.

  3. JANUARY SEASONALITY ADJUSTMENT
     - If the outlet has >= 1 historical January record:
         jan_factor = jan_avg_vol / mean_monthly_vol
     - Else: use the distributor-level Seasonality_Index from the Silver data
         Favorable = 1.15  |  Moderate = 1.00  |  Un-Favorable = 0.87

  4. FINAL PREDICTION
     prediction = max(base_ceiling * jan_factor, 1.0)
     (floored at 1.0 so no outlet has zero potential)

  5. BLACKOUT OUTLETS
     Outlets with no Dec 2025 data use recent_3m_avg as their volume base
     (their last known activity) rather than the full historical mean.

Inputs
------
  gold/features/outlet_stats.csv
  gold/features/outlet_features.csv

Outputs
-------
  gold/predictions/predictions_raw.csv    (full detail)
  metadata/clustering_report.csv          (cluster summary)
"""
from __future__ import annotations

import csv
import sys
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.cluster.vq import kmeans2, whiten

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
STATS_PATH  = ROOT / "gold" / "features" / "outlet_stats.csv"
FEAT_PATH   = ROOT / "gold" / "features" / "outlet_features.csv"
PRED_DIR    = ROOT / "gold" / "predictions"
PRED_DIR.mkdir(parents=True, exist_ok=True)
OUT_PRED    = PRED_DIR / "predictions_raw.csv"
OUT_CLUSTER = ROOT / "metadata" / "clustering_report.csv"

K_CLUSTERS   = 50
RANDOM_SEED  = 42
DIST_SEASON  = {"Favorable": 1.15, "Moderate": 1.00, "Un-Favorable": 0.87}
P90_SAFETY   = 1.05   # outlet's own p90 bumped 5% (censoring buffer)
FLOOR        = 1.0    # minimum prediction


# ── I/O ───────────────────────────────────────────────────────────────────────

def read_csv_dict(path: Path) -> dict[str, dict]:
    """Load CSV, keyed by Outlet_ID."""
    result = {}
    with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh):
            oid = row["Outlet_ID"].strip()
            result[oid] = row
    return result


def percentile(data: list[float], pct: float) -> float:
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * pct / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (k - lo) * (s[hi] - s[lo])


# ── Feature matrix assembly ───────────────────────────────────────────────────

CLUSTER_FEATURE_COLS = [
    # Volume profile (from outlet_stats)
    "mean_monthly_vol", "p90_monthly_vol", "std_monthly_vol",
    "recent_3m_avg", "jan_avg_vol",
    # Outlet attributes (from outlet_features)
    "size_score", "cooler_count",
    # POI density (from outlet_features)
    "count_worship_3km", "count_education_3km", "count_transport_3km",
    "count_market_3km", "count_food_3km",
]


def build_feature_matrix(
    outlet_ids: list[str],
    stats: dict[str, dict],
    feats: dict[str, dict],
) -> np.ndarray:
    """Returns float matrix (n_outlets, n_features). Missing = 0."""
    rows = []
    for oid in outlet_ids:
        s = stats.get(oid, {})
        f = feats.get(oid, {})
        row = []
        for col in CLUSTER_FEATURE_COLS:
            raw = s.get(col) or f.get(col) or "0"
            try:
                row.append(float(raw))
            except ValueError:
                row.append(0.0)
        rows.append(row)
    return np.array(rows, dtype=np.float64)


# ── Clustering ────────────────────────────────────────────────────────────────

def cluster_outlets(
    outlet_ids: list[str],
    X: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """
    K-Means with scipy. Returns (labels, centroids).
    Adds tiny noise to avoid duplicate-row issues with whiten.
    """
    np.random.seed(RANDOM_SEED)
    # Add tiny noise to prevent all-zero columns from crashing whiten()
    X_safe = X + np.random.normal(0, 1e-8, X.shape)
    X_w = whiten(X_safe)  # z-score normalization per column

    print(f"  Running K-Means (K={K_CLUSTERS}) on {len(outlet_ids)} outlets ...")
    centroids, labels = kmeans2(X_w, K_CLUSTERS, minit="points", seed=RANDOM_SEED)
    return labels, centroids


# ── Cluster ceiling computation ───────────────────────────────────────────────

def compute_cluster_ceilings(
    outlet_ids: list[str],
    labels: np.ndarray,
    stats: dict[str, dict],
) -> dict[int, float]:
    """
    For each cluster, ceiling = 90th percentile of max_monthly_vol.
    Returns {cluster_id: ceiling_value}.
    """
    cluster_maxes: dict[int, list[float]] = defaultdict(list)
    for oid, lbl in zip(outlet_ids, labels):
        s = stats.get(oid, {})
        try:
            mv = float(s.get("max_monthly_vol", 0) or 0)
        except ValueError:
            mv = 0.0
        cluster_maxes[int(lbl)].append(mv)

    ceilings = {}
    for cid, maxes in cluster_maxes.items():
        ceilings[cid] = percentile(maxes, 90)
    return ceilings


# ── January factor ────────────────────────────────────────────────────────────

def jan_seasonality_factor(s: dict, f: dict) -> float:
    """
    If Jan historical data exists: ratio = jan_avg / mean_monthly.
    Else: use distributor-level seasonality label.
    Bounded [0.5, 2.0] to prevent wild swings.
    """
    try:
        n_jan = int(s.get("n_jan_months", 0) or 0)
        if n_jan > 0:
            jan_avg = float(s.get("jan_avg_vol", 0) or 0)
            mean_vol = float(s.get("mean_monthly_vol", 1) or 1)
            if mean_vol > 0:
                ratio = jan_avg / mean_vol
                return max(0.5, min(2.0, ratio))
    except (ValueError, ZeroDivisionError):
        pass

    # Fall back to distributor seasonality label
    label = f.get("seasonality_jan2026_label", "Moderate")
    return DIST_SEASON.get(label, 1.0)


# ── Main prediction loop ──────────────────────────────────────────────────────

def main() -> None:
    print("=== Phase 4 - Censored Demand Ceiling Model ===\n")

    # ── Load data ─────────────────────────────────────────────────────────────
    print("[1] Loading outlet_stats and outlet_features ...")
    stats = read_csv_dict(STATS_PATH)
    feats = read_csv_dict(FEAT_PATH)
    outlet_ids = sorted(feats.keys())
    print(f"  Outlets in features: {len(outlet_ids):,}")
    print(f"  Outlets in stats:    {len(stats):,}")

    # Outlets in features but not in transactions (no history at all)
    no_history = [oid for oid in outlet_ids if oid not in stats]
    print(f"  Outlets with no transaction history: {len(no_history)}")

    # ── Build feature matrix ──────────────────────────────────────────────────
    print("\n[2] Building feature matrix ...")
    X = build_feature_matrix(outlet_ids, stats, feats)
    print(f"  Feature matrix: {X.shape[0]} x {X.shape[1]}")

    # ── Cluster ───────────────────────────────────────────────────────────────
    print("\n[3] Clustering ...")
    labels, _ = cluster_outlets(outlet_ids, X)
    label_counts = defaultdict(int)
    for lbl in labels:
        label_counts[int(lbl)] += 1
    sizes = sorted(label_counts.values())
    print(f"  Cluster size: min={sizes[0]} median={sizes[len(sizes)//2]} max={sizes[-1]}")

    # ── Cluster ceilings ──────────────────────────────────────────────────────
    print("\n[4] Computing cluster ceilings (90th pct of max_monthly_vol) ...")
    ceilings = compute_cluster_ceilings(outlet_ids, labels, stats)
    ceil_vals = sorted(ceilings.values())
    print(f"  Cluster ceilings: min={ceil_vals[0]:,.1f} "
          f"median={ceil_vals[len(ceil_vals)//2]:,.1f} "
          f"max={ceil_vals[-1]:,.1f} L")

    # ── Generate predictions ──────────────────────────────────────────────────
    print("\n[5] Generating predictions ...")
    pred_rows = []
    n_cluster_dominated = 0
    n_own_dominated = 0
    n_no_history = 0

    for oid, lbl in zip(outlet_ids, labels):
        s = stats.get(oid, {})
        f = feats.get(oid, {})
        cid = int(lbl)
        cluster_ceil = ceilings.get(cid, 0.0)

        # Outlet's own observed ceiling
        try:
            own_p90  = float(s.get("p90_monthly_vol", 0) or 0)
            own_max  = float(s.get("max_monthly_vol", 0) or 0)
            has_dec  = int(s.get("has_dec2025", 0) or 0)
            r3m      = float(s.get("recent_3m_avg", 0) or 0)
            n_months = int(s.get("n_months", 0) or 0)
        except ValueError:
            own_p90 = own_max = r3m = 0.0
            has_dec = n_months = 0

        if n_months == 0:
            # No transaction history — use cluster ceiling directly
            base = cluster_ceil
            n_no_history += 1
        else:
            own_floor = max(own_p90 * P90_SAFETY, own_max)
            base = max(own_floor, cluster_ceil)
            if cluster_ceil >= own_floor:
                n_cluster_dominated += 1
            else:
                n_own_dominated += 1

        # January seasonality factor
        jan_f = jan_seasonality_factor(s, f)

        # Final prediction
        # Hard floor: ceiling must be >= own observed max (already delivered)
        # and >= base*jan_f (cluster/seasonal estimate).
        raw_pred = base * jan_f
        prediction = max(raw_pred, own_max, FLOOR)

        pred_rows.append({
            "Outlet_ID": oid,
            "cluster_id": cid,
            "cluster_ceiling": round(cluster_ceil, 4),
            "own_p90_vol": round(own_p90, 4),
            "own_max_vol": round(own_max, 4),
            "base_ceiling": round(base, 4),
            "jan_factor": round(jan_f, 4),
            "n_months_history": n_months,
            "has_dec2025": has_dec,
            "Maximum_Monthly_Liters": round(prediction, 4),
        })

    print(f"  Cluster ceiling dominated: {n_cluster_dominated:,} outlets")
    print(f"  Own history dominated    : {n_own_dominated:,} outlets")
    print(f"  No history (cluster only): {n_no_history:,} outlets")

    # ── Write predictions ─────────────────────────────────────────────────────
    print("\n[6] Writing predictions ...")
    fieldnames = list(pred_rows[0].keys())
    with OUT_PRED.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(pred_rows)

    preds = [r["Maximum_Monthly_Liters"] for r in pred_rows]
    print(f"  {len(pred_rows):,} predictions written -> {OUT_PRED}")
    print(f"  Prediction range: {min(preds):,.1f} to {max(preds):,.1f} L")
    print(f"  Median prediction: {sorted(preds)[len(preds)//2]:,.1f} L")
    print(f"  Mean prediction:   {sum(preds)/len(preds):,.1f} L")

    # ── Write clustering report ───────────────────────────────────────────────
    print("\n[7] Writing clustering report ...")
    cluster_report = []
    for cid in range(K_CLUSTERS):
        members = [r for r in pred_rows if r["cluster_id"] == cid]
        if not members:
            continue
        preds_c = [r["Maximum_Monthly_Liters"] for r in members]
        cluster_report.append({
            "cluster_id": cid,
            "n_members": len(members),
            "cluster_ceiling_L": round(ceilings.get(cid, 0), 2),
            "pred_mean_L": round(sum(preds_c) / len(preds_c), 2),
            "pred_min_L": round(min(preds_c), 2),
            "pred_max_L": round(max(preds_c), 2),
        })
    with OUT_CLUSTER.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(cluster_report[0].keys()))
        writer.writeheader()
        writer.writerows(cluster_report)
    print(f"  Clustering report -> {OUT_CLUSTER}")

    print("\nPhase 4 modeling complete.")


if __name__ == "__main__":
    main()
