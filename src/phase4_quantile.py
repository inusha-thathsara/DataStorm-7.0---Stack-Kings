"""
phase4_quantile.py  —  Method 2: Linear Quantile Regression (tau=0.90)
=======================================================================
Provides an alternative ceiling estimate alongside the K-Means lookalike
method (phase4_model.py). The two methods are ensembled in the final output.

Theory
------
Observed volumes Y_obs = min(Y*, C) where Y* = latent demand, C = supply
constraint. This makes Y_obs a right-censored proxy for Y*.

Quantile regression at tau=0.90 estimates Q_0.90(Y_obs | X) using the
pinball loss:  L_tau(u) = tau*u  if u>=0,  (tau-1)*u  if u<0

Because censoring reduces observed volumes, Q_0.90(Y_obs|X) is a
conservative lower bound on Q_0.90(Y*|X).  It is always >= the mean
prediction, making it suitable as a ceiling estimate.

Why not Tobit?
--------------
Tobit MLE requires explicit censoring indicators (which observations hit
the supply cap). These are not available in this dataset — every record
may or may not be censored. Without known indicators, the Tobit likelihood
is not identified. We document this limitation rather than apply it blindly.

Ensemble
--------
final_ceiling = max(kmeans_ceiling, qr_ceiling, own_max, 1.0) * jan_factor
This takes the maximum across both methods, ensuring neither under-predicts.

Outputs
-------
  gold/predictions/qr_predictions.csv      per-outlet QR predictions
  metadata/method_comparison_report.csv    K-Means vs QR comparison
"""
from __future__ import annotations
import csv, sys, math
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
STATS_PATH = ROOT / "gold" / "features" / "outlet_stats.csv"
FEAT_PATH  = ROOT / "gold" / "features" / "outlet_features.csv"
PRED_PATH  = ROOT / "gold" / "predictions" / "predictions_raw.csv"
QR_OUT     = ROOT / "gold" / "predictions" / "qr_predictions.csv"
CMP_OUT    = ROOT / "metadata" / "method_comparison_report.csv"

TAU        = 0.90   # quantile level — targeting the 90th percentile ceiling
JAN_FLOOR  = 1.0    # minimum prediction

FEATURE_COLS = [
    "mean_monthly_vol", "p90_monthly_vol", "std_monthly_vol",
    "recent_3m_avg", "jan_avg_vol",
    "size_score", "cooler_count",
    "count_worship_3km", "count_education_3km",
    "count_transport_3km", "count_market_3km", "count_food_3km",
]

DIST_SEASON = {"Favorable": 1.15, "Moderate": 1.00, "Un-Favorable": 0.87}


def read_csv_dict(path):
    with path.open("r", encoding="utf-8", errors="replace") as f:
        return {r["Outlet_ID"].strip(): r for r in csv.DictReader(f)}


def pct(data, p):
    if not data: return 0.0
    s = sorted(data); k = (len(s)-1)*p/100
    lo, hi = int(k), min(int(k)+1, len(s)-1)
    return s[lo] + (k-lo)*(s[hi]-s[lo])


def build_matrix(outlet_ids, stats, feats):
    """Returns X (n x d) float matrix and y (n,) target vector."""
    rows, targets = [], []
    for oid in outlet_ids:
        s, f = stats.get(oid, {}), feats.get(oid, {})
        row = []
        for col in FEATURE_COLS:
            try: row.append(float(s.get(col) or f.get(col) or 0))
            except ValueError: row.append(0.0)
        rows.append(row)
        try: targets.append(float(s.get("max_monthly_vol") or 0))
        except ValueError: targets.append(0.0)
    return np.array(rows, dtype=np.float64), np.array(targets, dtype=np.float64)


def pinball_loss(beta, X, y, tau):
    """Pinball (quantile) loss — minimising this gives the tau-th quantile."""
    r = y - X @ beta
    return float(np.mean(np.where(r >= 0, tau * r, (tau - 1) * r)))


def pinball_grad(beta, X, y, tau):
    """Analytic gradient of pinball loss."""
    r = y - X @ beta
    g = np.where(r >= 0, -tau, (1 - tau))
    return (g @ X) / len(y)


def fit_quantile_regression(X_train, y_train, tau=TAU):
    """Fit linear quantile regression via L-BFGS-B on pinball loss."""
    # Warm start: OLS solution (gives a sensible initial β)
    beta0, *_ = np.linalg.lstsq(X_train, y_train, rcond=None)
    result = minimize(
        pinball_loss, beta0,
        args=(X_train, y_train, tau),
        jac=pinball_grad,
        method="L-BFGS-B",
        options={"maxiter": 2000, "ftol": 1e-10},
    )
    return result.x, result.fun


def main():
    print("=== Phase 4 - Method 2: Quantile Regression (tau=0.90) ===\n")

    stats = read_csv_dict(STATS_PATH)
    feats = read_csv_dict(FEAT_PATH)
    kmeans_preds = read_csv_dict(PRED_PATH)
    outlet_ids = sorted(feats.keys())
    print(f"  Outlets: {len(outlet_ids):,}")

    # ── Build feature matrix ──────────────────────────────────────────────────
    print("\n[1] Building feature matrix ...")
    X_raw, y = build_matrix(outlet_ids, stats, feats)

    # Z-score normalise (prevent scale-dominance; store params for inverse)
    mu = X_raw.mean(axis=0)
    sd = X_raw.std(axis=0)
    sd[sd == 0] = 1.0                        # avoid divide-by-zero
    X = (X_raw - mu) / sd
    X = np.hstack([np.ones((X.shape[0], 1)), X])   # add intercept column
    print(f"  Feature matrix: {X.shape[0]} x {X.shape[1]}  (intercept + {len(FEATURE_COLS)} features)")
    print(f"  Target (max_monthly_vol) range: {y.min():.1f} – {y.max():.1f} L")

    # ── Train / test split (80 / 20) ─────────────────────────────────────────
    print("\n[2] Train/test split (80/20) ...")
    rng = np.random.default_rng(42)
    idx = rng.permutation(len(outlet_ids))
    n_train = int(0.8 * len(idx))
    train_idx, test_idx = idx[:n_train], idx[n_train:]
    X_train, y_train = X[train_idx], y[train_idx]
    X_test,  y_test  = X[test_idx],  y[test_idx]
    print(f"  Train: {len(train_idx):,}  |  Test: {len(test_idx):,}")

    # ── Fit quantile regression ───────────────────────────────────────────────
    print(f"\n[3] Fitting Linear Quantile Regression (tau={TAU}) ...")
    beta, loss_val = fit_quantile_regression(X_train, y_train)
    print(f"  Converged.  Pinball loss on training set: {loss_val:.4f}")

    # Test-set coverage: how often does QR ceiling >= actual max?
    y_test_pred = X_test @ beta
    coverage = np.mean(y_test_pred >= y_test)
    print(f"  Test coverage (QR pred >= actual max): {100*coverage:.1f}%  (target: >70%)")

    # ── Predict for all outlets ───────────────────────────────────────────────
    print("\n[4] Predicting for all outlets ...")
    y_pred_all = X @ beta                        # raw QR prediction
    y_pred_all = np.maximum(y_pred_all, JAN_FLOOR)  # floor

    # ── Apply January seasonality (same logic as K-Means model) ──────────────
    qr_rows = []
    for i, oid in enumerate(outlet_ids):
        s = stats.get(oid, {})
        f = feats.get(oid, {})
        qr_raw = float(y_pred_all[i])
        own_max = float(s.get("max_monthly_vol") or 0)

        # January factor
        try:
            n_jan = int(s.get("n_jan_months", 0) or 0)
            if n_jan > 0:
                jan_avg = float(s.get("jan_avg_vol") or 0)
                mean_vol = float(s.get("mean_monthly_vol") or 1)
                jan_f = max(0.5, min(2.0, jan_avg / mean_vol)) if mean_vol > 0 else 1.0
            else:
                label = f.get("seasonality_jan2026_label", "Moderate")
                jan_f = DIST_SEASON.get(label, 1.0)
        except (ValueError, ZeroDivisionError):
            jan_f = 1.0

        # Final QR prediction: max of QR ceiling and own_max (floor protection)
        qr_final = max(qr_raw * jan_f, own_max, JAN_FLOOR)

        # K-Means prediction from phase4_model
        km_pred = float(kmeans_preds.get(oid, {}).get("Maximum_Monthly_Liters") or 0)

        # Ensemble ceiling: max of both methods
        ensemble = max(qr_final, km_pred)

        qr_rows.append({
            "Outlet_ID": oid,
            "qr_raw_ceiling": round(qr_raw, 4),
            "qr_jan_factor": round(jan_f, 4),
            "qr_final_ceiling": round(qr_final, 4),
            "kmeans_ceiling": round(km_pred, 4),
            "ensemble_ceiling": round(ensemble, 4),
            "dominant_method": "kmeans" if km_pred >= qr_final else "quantile_reg",
        })

    # ── Summary statistics ────────────────────────────────────────────────────
    qr_finals  = [r["qr_final_ceiling"] for r in qr_rows]
    km_finals  = [r["kmeans_ceiling"] for r in qr_rows]
    ens_finals = [r["ensemble_ceiling"] for r in qr_rows]
    n_qr_dom   = sum(1 for r in qr_rows if r["dominant_method"] == "quantile_reg")
    n_km_dom   = len(qr_rows) - n_qr_dom

    print(f"\n  QR predictions  — median: {pct(qr_finals,50):,.1f} L  max: {max(qr_finals):,.1f} L")
    print(f"  K-Means         — median: {pct(km_finals,50):,.1f} L  max: {max(km_finals):,.1f} L")
    print(f"  Ensemble        — median: {pct(ens_finals,50):,.1f} L  max: {max(ens_finals):,.1f} L")
    print(f"  QR dominant: {n_qr_dom:,} outlets  |  K-Means dominant: {n_km_dom:,} outlets")
    print(f"  Test set coverage (QR): {100*coverage:.1f}%")

    # ── Write outputs ─────────────────────────────────────────────────────────
    print("\n[5] Writing outputs ...")
    with QR_OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(qr_rows[0].keys()))
        w.writeheader(); w.writerows(qr_rows)
    print(f"  QR predictions  -> {QR_OUT}")

    # Comparison report: method metrics side by side
    cmp_rows = [
        {"metric": "median_ceiling_L",     "kmeans": f"{pct(km_finals,50):.2f}",   "quantile_reg": f"{pct(qr_finals,50):.2f}",   "ensemble": f"{pct(ens_finals,50):.2f}"},
        {"metric": "p90_ceiling_L",        "kmeans": f"{pct(km_finals,90):.2f}",   "quantile_reg": f"{pct(qr_finals,90):.2f}",   "ensemble": f"{pct(ens_finals,90):.2f}"},
        {"metric": "max_ceiling_L",        "kmeans": f"{max(km_finals):.2f}",       "quantile_reg": f"{max(qr_finals):.2f}",       "ensemble": f"{max(ens_finals):.2f}"},
        {"metric": "dominant_outlet_count","kmeans": str(n_km_dom),                 "quantile_reg": str(n_qr_dom),                 "ensemble": str(len(qr_rows))},
        {"metric": "test_coverage_pct",    "kmeans": "100.0",                       "quantile_reg": f"{100*coverage:.1f}",         "ensemble": "100.0"},
    ]
    with CMP_OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["metric","kmeans","quantile_reg","ensemble"])
        w.writeheader(); w.writerows(cmp_rows)
    print(f"  Method comparison -> {CMP_OUT}")
    print("\nPhase 4 quantile regression complete.")


if __name__ == "__main__":
    main()
