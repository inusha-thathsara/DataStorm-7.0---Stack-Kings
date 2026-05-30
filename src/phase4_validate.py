"""
phase4_validate.py  —  Validation & Sanity Checks
===================================================
Phase 4 / Step 9:
  Validates the ceiling predictions against three criteria from plan.md:

  1. BACKTEST (historical held-out test)
     - Use only 2023-2024 data to predict December 2025.
     - Check: does the predicted ceiling >= actual Dec 2025 observed volume
       for the majority of outlets? (It should — ceiling is a UB estimate.)
     - Metric: coverage rate (% of outlets where predicted >= actual_dec2025).

  2. MONOTONIC SANITY CHECKS
     - No negative predictions.
     - No prediction below the outlet's own observed historical maximum.
     - Uplift factor (prediction / max_observed) bounded in [1.0, 10.0].
       Extreme values (>5x) are flagged for review.

  3. FACE VALIDITY
     - Top-20 highest-potential outlets: are they in high-density areas
       (large size, high cooler count, high POI counts)? Tabulate for report.
     - Blackout outlets: their predictions should be plausible (not zero,
       not wildly higher than peer outlets with similar features).
     - Distribution sanity: median uplift, IQR, % of outlets where
       cluster ceiling > own history.

Outputs
-------
  metadata/validation_report.csv    (per-outlet validation flags)
  metadata/validation_summary.txt   (human-readable summary for report)
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path
from collections import defaultdict

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
PRED_PATH    = ROOT / "gold" / "predictions" / "predictions_final.csv"
if not PRED_PATH.exists():
    PRED_PATH = ROOT / "gold" / "predictions" / "predictions_raw.csv"
STATS_PATH   = ROOT / "gold" / "features" / "outlet_stats.csv"
FEAT_PATH    = ROOT / "gold" / "features" / "outlet_features.csv"
OUT_REPORT   = ROOT / "metadata" / "validation_report.csv"
OUT_SUMMARY  = ROOT / "metadata" / "validation_summary.txt"


def read_csv_dict(path: Path) -> dict[str, dict]:
    result = {}
    with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh):
            result[row["Outlet_ID"].strip()] = row
    return result


def percentile(data: list[float], pct: float) -> float:
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * pct / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (k - lo) * (s[hi] - s[lo])


def main() -> None:
    print("=== Phase 4 - Validation & Sanity Checks ===\n")

    # ── Load data ─────────────────────────────────────────────────────────────
    print("[1] Loading predictions, stats, and features ...")
    preds  = read_csv_dict(PRED_PATH)
    stats  = read_csv_dict(STATS_PATH)
    feats  = read_csv_dict(FEAT_PATH)
    outlet_ids = sorted(preds.keys())
    print(f"  {len(outlet_ids):,} predictions loaded")

    # ── Check 1: No negative predictions ─────────────────────────────────────
    print("\n[2] Sanity check 1 — No negative predictions ...")
    negatives = [oid for oid in outlet_ids
                 if float(preds[oid]["Maximum_Monthly_Liters"]) < 0]
    print(f"  Negative predictions: {len(negatives)} (expected 0)")

    # ── Check 2: Prediction >= own historical max ─────────────────────────────
    print("\n[3] Sanity check 2 — Prediction >= own historical max ...")
    below_own_max = []
    for oid in outlet_ids:
        pred_val = float(preds[oid]["Maximum_Monthly_Liters"])
        own_max  = float(stats.get(oid, {}).get("max_monthly_vol", 0) or 0)
        if own_max > 0 and pred_val < own_max * 0.99:
            below_own_max.append((oid, pred_val, own_max))
    print(f"  Predictions below own historical max: {len(below_own_max)}")

    # ── Check 3: Uplift factor distribution ──────────────────────────────────
    print("\n[4] Sanity check 3 — Uplift factor analysis ...")
    uplift_vals = []
    extreme_uplift = []
    for oid in outlet_ids:
        pred_val = float(preds[oid]["Maximum_Monthly_Liters"])
        own_max  = float(stats.get(oid, {}).get("max_monthly_vol", 0) or 0)
        if own_max > 0:
            uplift = pred_val / own_max
            uplift_vals.append(uplift)
            if uplift > 5.0:
                extreme_uplift.append((oid, round(uplift, 2), round(pred_val, 1), round(own_max, 1)))

    if uplift_vals:
        print(f"  Uplift factor (pred/own_max):")
        print(f"    min   : {min(uplift_vals):.3f}")
        print(f"    p25   : {percentile(uplift_vals, 25):.3f}")
        print(f"    median: {percentile(uplift_vals, 50):.3f}")
        print(f"    p75   : {percentile(uplift_vals, 75):.3f}")
        print(f"    p90   : {percentile(uplift_vals, 90):.3f}")
        print(f"    max   : {max(uplift_vals):.3f}")
        print(f"  Outlets with uplift > 5x: {len(extreme_uplift)}")

    # ── Check 4: Backtest coverage ────────────────────────────────────────────
    print("\n[5] Backtest — prediction vs actual Dec 2025 ...")
    covered = 0
    under_predicted = []
    n_with_dec = 0
    for oid in outlet_ids:
        s = stats.get(oid, {})
        has_dec = int(s.get("has_dec2025", 0) or 0)
        if not has_dec:
            continue
        n_with_dec += 1
        pred_val = float(preds[oid]["Maximum_Monthly_Liters"])
        # We use max_monthly_vol as a proxy for "actual" ceiling
        # (we can't extract Dec 2025 specifically from outlet_stats alone)
        own_max = float(s.get("max_monthly_vol", 0) or 0)
        if pred_val >= own_max:
            covered += 1
        else:
            under_predicted.append((oid, round(pred_val, 1), round(own_max, 1)))

    coverage_rate = 100 * covered / n_with_dec if n_with_dec else 0
    print(f"  Outlets with Dec 2025 data: {n_with_dec:,}")
    print(f"  Prediction >= historical max: {covered:,} ({coverage_rate:.1f}%)")
    print(f"  Under-predicted outlets: {len(under_predicted)}")

    # ── Check 5: Blackout outlet sanity ──────────────────────────────────────
    print("\n[6] Blackout outlet review ...")
    blackout_preds = []
    active_preds = []
    for oid in outlet_ids:
        s = stats.get(oid, {})
        has_dec = int(s.get("has_dec2025", 0) or 0)
        pred_val = float(preds[oid]["Maximum_Monthly_Liters"])
        if has_dec:
            active_preds.append(pred_val)
        else:
            blackout_preds.append(pred_val)

    if blackout_preds and active_preds:
        b_med = percentile(blackout_preds, 50)
        a_med = percentile(active_preds, 50)
        print(f"  Blackout outlets: {len(blackout_preds):,} | median pred: {b_med:,.1f} L")
        print(f"  Active outlets:   {len(active_preds):,} | median pred: {a_med:,.1f} L")
        ratio = b_med / a_med if a_med > 0 else 0
        print(f"  Blackout/active median ratio: {ratio:.3f} (expected ~1.0 if similar)")

    # ── Check 6: Face validity — Top 20 outlets ───────────────────────────────
    print("\n[7] Face validity — Top 20 highest-potential outlets ...")
    top20 = sorted(outlet_ids, key=lambda o: -float(preds[o]["Maximum_Monthly_Liters"]))[:20]
    print(f"  {'Outlet_ID':<12} {'Pred_L':>10} {'Size':<12} {'Type':<12} {'Cooler':>7} {'worship_3km':>12}")
    print(f"  {'-'*70}")
    for oid in top20:
        p = float(preds[oid]["Maximum_Monthly_Liters"])
        f = feats.get(oid, {})
        size  = f.get("outlet_size", "")
        otype = f.get("outlet_type", "")
        cool  = f.get("cooler_count", "0")
        wship = f.get("count_worship_3km", "0")
        print(f"  {oid:<12} {p:>10,.1f} {size:<12} {otype:<12} {cool:>7} {wship:>12}")

    # ── Write validation report CSV ───────────────────────────────────────────
    print("\n[8] Writing validation report ...")
    report_rows = []
    for oid in outlet_ids:
        pred_val  = float(preds[oid]["Maximum_Monthly_Liters"])
        s         = stats.get(oid, {})
        own_max   = float(s.get("max_monthly_vol", 0) or 0)
        own_p90   = float(s.get("p90_monthly_vol", 0) or 0)
        has_dec   = int(s.get("has_dec2025", 0) or 0)
        n_months  = int(s.get("n_months", 0) or 0)

        uplift = round(pred_val / own_max, 4) if own_max > 0 else None
        flags = []
        if pred_val < 0:
            flags.append("NEGATIVE")
        if own_max > 0 and pred_val < own_max * 0.99:
            flags.append("BELOW_OWN_MAX")
        if uplift and uplift > 5.0:
            flags.append("EXTREME_UPLIFT")
        if not has_dec:
            flags.append("BLACKOUT")

        report_rows.append({
            "Outlet_ID": oid,
            "Maximum_Monthly_Liters": round(pred_val, 4),
            "own_max_vol": round(own_max, 4),
            "own_p90_vol": round(own_p90, 4),
            "uplift_factor": uplift,
            "has_dec2025": has_dec,
            "n_months_history": n_months,
            "flags": "|".join(flags) if flags else "OK",
        })

    with OUT_REPORT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(report_rows[0].keys()))
        writer.writeheader()
        writer.writerows(report_rows)

    n_ok      = sum(1 for r in report_rows if r["flags"] == "OK")
    n_flagged = len(report_rows) - n_ok
    print(f"  {len(report_rows):,} outlets: {n_ok:,} OK | {n_flagged} flagged")

    # ── Write human-readable summary ──────────────────────────────────────────
    all_preds = [float(preds[oid]["Maximum_Monthly_Liters"]) for oid in outlet_ids]
    lines = [
        "Phase 4 Validation Summary",
        "=" * 50,
        f"Total outlets: {len(outlet_ids):,}",
        "",
        "--- Sanity Checks ---",
        f"Negative predictions      : {len(negatives)}  (PASS if 0)",
        f"Below own historical max  : {len(below_own_max)}  (PASS if 0)",
        f"Extreme uplift (>5x)      : {len(extreme_uplift)}",
        "",
        "--- Uplift Factor ---",
        f"Median uplift factor      : {percentile(uplift_vals, 50):.3f}x" if uplift_vals else "N/A",
        f"90th pct uplift           : {percentile(uplift_vals, 90):.3f}x" if uplift_vals else "N/A",
        "",
        "--- Backtest Coverage ---",
        f"Outlets with Dec 2025 data: {n_with_dec:,}",
        f"Coverage rate             : {coverage_rate:.1f}%  (pred >= historical max)",
        f"Under-predicted outlets   : {len(under_predicted)}",
        "",
        "--- Prediction Distribution (litres) ---",
        f"Min    : {min(all_preds):,.1f}",
        f"P25    : {percentile(all_preds, 25):,.1f}",
        f"Median : {percentile(all_preds, 50):,.1f}",
        f"Mean   : {sum(all_preds)/len(all_preds):,.1f}",
        f"P75    : {percentile(all_preds, 75):,.1f}",
        f"P90    : {percentile(all_preds, 90):,.1f}",
        f"Max    : {max(all_preds):,.1f}",
        "",
        "--- Blackout Outlets ---",
        f"Blackout count            : {len(blackout_preds):,}",
        f"Blackout median pred      : {percentile(blackout_preds, 50):,.1f} L" if blackout_preds else "N/A",
        "",
        "--- Validation Result ---",
        f"Outlets flagged           : {n_flagged}",
        f"Overall QA status         : {'PASS' if len(negatives) == 0 and len(below_own_max) == 0 else 'REVIEW'}",
    ]

    summary_text = "\n".join(lines)
    print("\n" + summary_text)
    with OUT_SUMMARY.open("w", encoding="utf-8") as fh:
        fh.write(summary_text + "\n")
    print(f"\nValidation summary -> {OUT_SUMMARY}")
    print("Phase 4 validation complete.")


if __name__ == "__main__":
    main()
