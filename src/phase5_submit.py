"""
phase5_submit.py  —  Final Submission CSV Generator (Round 2)
==============================================================
Produces both required deliverables:
  1. StackKings_predictions.csv       — 20,000 outlets, latent potential
  2. StackKings_budget_allocations.csv — Western Province trade spend
"""
from __future__ import annotations
import csv, sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
PRED_PATH = ROOT / "gold" / "predictions" / "predictions_final.csv"
STATS_PATH = ROOT / "gold" / "features" / "outlet_stats.csv"
BUDGET_PATH = ROOT / "submissions" / "StackKings_budget_allocations.csv"
SUB_DIR = ROOT / "submissions"
SUB_DIR.mkdir(parents=True, exist_ok=True)
PRED_OUT = SUB_DIR / "StackKings_predictions.csv"
SUBMISSION_OUT = SUB_DIR / "submission.csv"


def pct(data, p):
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * p / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (k - lo) * (s[hi] - s[lo])


def main() -> None:
    print("=== Phase 5 - Final Submission CSVs (Round 2) ===\n")

    if not PRED_PATH.exists():
        print(f"  ERROR: Run phase4_predict.py first ({PRED_PATH})")
        sys.exit(1)

    pred_rows = []
    with PRED_PATH.open("r", encoding="utf-8", newline="") as f:
        pred_rows = list(csv.DictReader(f))

    # Workstream 2B: 100% predictions >= own historical max
    stats_map: dict[str, dict] = {}
    if STATS_PATH.exists():
        with STATS_PATH.open("r", encoding="utf-8", newline="") as f:
            stats_map = {r["Outlet_ID"].strip(): r for r in csv.DictReader(f)}
    n_below = 0
    for row in pred_rows:
        oid = row["Outlet_ID"].strip()
        pred = float(row["Maximum_Monthly_Liters"])
        own_max = float(stats_map.get(oid, {}).get("max_monthly_vol", 0) or 0)
        if pred < own_max - 1e-6:
            n_below += 1
    if n_below > 0:
        print(f"  ERROR: {n_below} predictions below own historical max — run phase4_validate.py")
        sys.exit(1)
    print(f"  Backtest floor check: {len(pred_rows):,} outlets >= own max (PASS)")

    rows = [
        {
            "Outlet_ID": r["Outlet_ID"].strip(),
            "Maximum_Monthly_Liters": round(float(r["Maximum_Monthly_Liters"]), 2),
        }
        for r in pred_rows
    ]
    rows.sort(key=lambda r: r["Outlet_ID"])
    assert len(rows) == 20_000, f"Expected 20000 rows, got {len(rows)}"
    assert all(r["Maximum_Monthly_Liters"] > 0 for r in rows)
    assert len({r["Outlet_ID"] for r in rows}) == 20_000

    for out_path in (PRED_OUT, SUBMISSION_OUT):
        with out_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["Outlet_ID", "Maximum_Monthly_Liters"])
            writer.writeheader()
            writer.writerows(rows)

    vals = [r["Maximum_Monthly_Liters"] for r in rows]
    print(f"  Predictions: {len(rows):,} rows -> {PRED_OUT}")
    print(f"  Median: {pct(vals, 50):,.2f} L | Max: {max(vals):,.2f} L")

    if BUDGET_PATH.exists():
        budget_rows = list(csv.DictReader(BUDGET_PATH.open(encoding="utf-8")))
        total = sum(float(r["Trade_Spend_LKR"]) for r in budget_rows)
        print(f"  Budget file: {len(budget_rows):,} Western outlets, LKR {total:,.2f}")
    else:
        print("  WARNING: Budget file missing — run phase4_optimize.py")

    print("\nSubmission CSVs complete.")


if __name__ == "__main__":
    main()
