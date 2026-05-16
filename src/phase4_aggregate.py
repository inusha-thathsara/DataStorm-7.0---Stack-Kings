"""
phase4_aggregate.py  —  Transaction Aggregation to Outlet-Level Statistics
===========================================================================
Phase 4 / Step 8 (part 1):
  Streams silver/clean/transactions_history_final.csv (2.3M rows),
  aggregates to outlet-month level (sum of all SKUs per outlet per month),
  and computes per-outlet historical statistics used as model features.

Output
------
  gold/features/outlet_stats.csv   (one row per Outlet_ID)

Key statistics produced
-----------------------
  n_months          : distinct year-month records with any volume
  mean_monthly_vol  : mean aggregate volume per month
  std_monthly_vol   : standard deviation
  max_monthly_vol   : highest ever monthly volume (censored ceiling lower bound)
  p90_monthly_vol   : 90th percentile of monthly volumes
  p75_monthly_vol   : 75th percentile
  jan_avg_vol       : average January volume (if Jan data exists, else 0)
  n_jan_months      : number of Januaries with data (max 3: 2023, 2024, 2025)
  recent_3m_avg     : average of Oct/Nov/Dec 2025 (latest 3 months)
  trend_slope       : OLS trend coefficient (positive = growing demand)
  has_dec2025       : 1 if outlet has Dec 2025 data, 0 if blackout
  n_skus            : number of distinct SKUs purchased
  primary_distributor: modal distributor (last-seen if tie)
"""
from __future__ import annotations

import csv
import sys
import math
from collections import defaultdict
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
TX_PATH = ROOT / "silver" / "clean" / "transactions_history_final.csv"
OUT_PATH = ROOT / "gold" / "features" / "outlet_stats.csv"
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

CHUNK = 250_000


# ── Helpers ───────────────────────────────────────────────────────────────────

def percentile(data: list[float], pct: float) -> float:
    """Compute percentile from a sorted or unsorted list."""
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * pct / 100
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (k - lo) * (s[hi] - s[lo])


def ols_slope(xs: list[float], ys: list[float]) -> float:
    """Simple OLS slope: beta = Cov(x,y) / Var(x)."""
    n = len(xs)
    if n < 2:
        return 0.0
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    return num / den if den > 0 else 0.0


# ── Pass 1: accumulate volume by (Outlet_ID, Year, Month) ────────────────────

def aggregate_transactions() -> dict[str, dict[tuple[int, int], float]]:
    """Returns {Outlet_ID: {(year, month): total_volume}}."""
    volumes: dict[str, dict[tuple[int, int], float]] = defaultdict(lambda: defaultdict(float))
    skus: dict[str, set[str]] = defaultdict(set)
    dist_last: dict[str, str] = {}
    dist_freq: dict[str, defaultdict] = defaultdict(lambda: defaultdict(int))

    total = 0
    print(f"  Streaming {TX_PATH.name} ...")
    with TX_PATH.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            total += 1
            oid = row.get("Outlet_ID", "").strip()
            did = row.get("Distributor_ID", "").strip()
            sku = row.get("SKU_ID", "").strip()
            try:
                yr = int(row.get("Year", 0))
                mo = int(row.get("Month", 0))
                vol = float(row.get("Volume_Liters", 0) or 0)
            except ValueError:
                continue
            if not oid or yr < 2023:
                continue
            volumes[oid][(yr, mo)] += vol
            skus[oid].add(sku)
            dist_freq[oid][did] += 1
            dist_last[oid] = did
            if total % CHUNK == 0:
                print(f"    {total:,} rows processed ...")

    print(f"  Done. {total:,} rows, {len(volumes)} unique outlets.\n")
    return volumes, skus, dist_freq, dist_last


# ── Pass 2: compute per-outlet statistics ─────────────────────────────────────

def compute_outlet_stats(
    volumes: dict,
    skus: dict,
    dist_freq: dict,
    dist_last: dict,
) -> list[dict]:
    rows_out = []

    for oid, month_vol in volumes.items():
        monthly_vols = list(month_vol.values())
        year_months = sorted(month_vol.keys())
        n_months = len(monthly_vols)

        # Basic statistics
        mean_vol = sum(monthly_vols) / n_months
        std_vol = math.sqrt(
            sum((v - mean_vol) ** 2 for v in monthly_vols) / n_months
        ) if n_months > 1 else 0.0
        max_vol = max(monthly_vols)
        p90_vol = percentile(monthly_vols, 90)
        p75_vol = percentile(monthly_vols, 75)

        # January-specific
        jan_vols = [v for (yr, mo), v in month_vol.items() if mo == 1]
        jan_avg = sum(jan_vols) / len(jan_vols) if jan_vols else 0.0
        n_jan = len(jan_vols)

        # Recent 3-month average (Oct/Nov/Dec 2025)
        recent_keys = [(2025, 10), (2025, 11), (2025, 12)]
        recent_vols = [month_vol[k] for k in recent_keys if k in month_vol]
        recent_3m = sum(recent_vols) / len(recent_vols) if recent_vols else mean_vol

        # Blackout detection
        has_dec2025 = int((2025, 12) in month_vol)

        # Trend: OLS slope on (time_index, volume)
        time_idx = [
            (yr - 2023) * 12 + (mo - 1)
            for yr, mo in year_months
        ]
        vol_seq = [month_vol[(yr, mo)] for yr, mo in year_months]
        slope = ols_slope(time_idx, vol_seq)

        # Primary distributor (mode, then last-seen as tiebreak)
        dist_counts = dist_freq.get(oid, {})
        primary_dist = max(dist_counts, key=dist_counts.get) if dist_counts else dist_last.get(oid, "")

        rows_out.append({
            "Outlet_ID": oid,
            "n_months": n_months,
            "mean_monthly_vol": round(mean_vol, 4),
            "std_monthly_vol": round(std_vol, 4),
            "max_monthly_vol": round(max_vol, 4),
            "p90_monthly_vol": round(p90_vol, 4),
            "p75_monthly_vol": round(p75_vol, 4),
            "jan_avg_vol": round(jan_avg, 4),
            "n_jan_months": n_jan,
            "recent_3m_avg": round(recent_3m, 4),
            "trend_slope": round(slope, 6),
            "has_dec2025": has_dec2025,
            "n_skus": len(skus.get(oid, set())),
            "primary_distributor": primary_dist,
        })

    return rows_out


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== Phase 4 - Transaction Aggregation ===\n")

    volumes, skus, dist_freq, dist_last = aggregate_transactions()
    print("Computing per-outlet statistics ...")
    stats_rows = compute_outlet_stats(volumes, skus, dist_freq, dist_last)

    fieldnames = list(stats_rows[0].keys()) if stats_rows else []
    with OUT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(stats_rows)

    # Quick summary
    max_vols = [r["max_monthly_vol"] for r in stats_rows]
    has_dec = sum(r["has_dec2025"] for r in stats_rows)
    blackouts = len(stats_rows) - has_dec
    mean_max = sum(max_vols) / len(max_vols) if max_vols else 0
    p90_max = percentile(max_vols, 90)

    print(f"\n  Outlets with stats: {len(stats_rows):,}")
    print(f"  Outlets with Dec 2025 data: {has_dec:,}")
    print(f"  Blackout outlets (no Dec 2025): {blackouts:,}")
    print(f"  Mean of max_monthly_vol: {mean_max:,.1f} L")
    print(f"  90th pct of max_monthly_vol: {p90_max:,.1f} L")
    print(f"\n  Saved -> {OUT_PATH}")
    print("\nPhase 4 aggregation complete.")


if __name__ == "__main__":
    main()
