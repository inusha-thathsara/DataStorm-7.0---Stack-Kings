"""
phase5_submit.py  —  Final Submission CSV Generator
=====================================================
Phase 5 / Step 10 (part 1):
  Reads gold/predictions/predictions_raw.csv and produces the final
  Kaggle-format submission: exactly 2 columns, 20,000 rows, sorted by
  Outlet_ID, Maximum_Monthly_Liters rounded to 2 decimal places.

Output
------
  submissions/submission.csv
"""
from __future__ import annotations
import csv, sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
PRED_PATH = ROOT / "gold" / "predictions" / "predictions_raw.csv"
SUB_DIR   = ROOT / "submissions"
SUB_DIR.mkdir(parents=True, exist_ok=True)
OUT_PATH  = SUB_DIR / "submission.csv"

def pct(data, p):
    if not data: return 0.0
    s = sorted(data); k = (len(s)-1)*p/100
    lo, hi = int(k), min(int(k)+1, len(s)-1)
    return s[lo] + (k-lo)*(s[hi]-s[lo])

def main() -> None:
    print("=== Phase 5 - Final Submission CSV ===\n")

    # Load raw predictions
    rows = []
    with PRED_PATH.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            rows.append({
                "Outlet_ID": row["Outlet_ID"].strip(),
                "Maximum_Monthly_Liters": round(float(row["Maximum_Monthly_Liters"]), 2),
            })

    # Sort by Outlet_ID
    rows.sort(key=lambda r: r["Outlet_ID"])

    # Validate
    assert len(rows) == 20_000, f"Expected 20000 rows, got {len(rows)}"
    assert all(r["Maximum_Monthly_Liters"] > 0 for r in rows), "Zero/negative predictions found!"
    outlet_ids = [r["Outlet_ID"] for r in rows]
    assert len(set(outlet_ids)) == 20_000, "Duplicate Outlet_IDs in submission!"

    # Write
    with OUT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Outlet_ID","Maximum_Monthly_Liters"])
        writer.writeheader()
        writer.writerows(rows)

    vals = [r["Maximum_Monthly_Liters"] for r in rows]
    print(f"  Rows       : {len(rows):,}")
    print(f"  Min        : {min(vals):,.2f} L")
    print(f"  P25        : {pct(vals, 25):,.2f} L")
    print(f"  Median     : {pct(vals, 50):,.2f} L")
    print(f"  Mean       : {sum(vals)/len(vals):,.2f} L")
    print(f"  P75        : {pct(vals, 75):,.2f} L")
    print(f"  P90        : {pct(vals, 90):,.2f} L")
    print(f"  Max        : {max(vals):,.2f} L")
    print(f"\n  Saved -> {OUT_PATH}")
    print(f"  File size  : {OUT_PATH.stat().st_size:,} bytes")
    print("\nSubmission CSV complete.")

if __name__ == "__main__":
    main()
