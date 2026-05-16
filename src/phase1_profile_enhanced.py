"""
Phase 1 – Step 3 (enhanced): Full profile of transactions_history_final.csv
=============================================================================
Extends the basic profile with:
  - Duplicate row count (exact) and PK-duplicate count
  - Negative value counts (anomalies)
  - Per-outlet, per-distributor, per-SKU cardinality
  - Outlet-level volume statistics (min, max, mean, std via one-pass Welford)
  - Blackout detection: outlets with zero or no data in Jan 2026 window

Output: metadata/transactions_profile_full.csv
"""
from __future__ import annotations

import csv
import datetime as dt
import math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = BRONZE_RAW = ROOT / "bronze" / "raw"
DATASET_PATH = BRONZE_RAW / "transactions_history_final.csv"
OUTPUT_PATH = ROOT / "metadata" / "transactions_profile_full.csv"

CHUNK_SIZE = 250_000

REQUIRED_COLUMNS = [
    "Outlet_ID",
    "Year",
    "Month",
    "Distributor_ID",
    "SKU_ID",
    "Volume_Liters",
    "Total_Bill_Value",
]

PK_FIELDS = ["Outlet_ID", "Year", "Month", "Distributor_ID", "SKU_ID"]


def parse_float(v: str) -> float | None:
    if not v or not v.strip():
        return None
    try:
        return float(v.strip())
    except ValueError:
        return None


def parse_int(v: str) -> int | None:
    if not v or not v.strip():
        return None
    try:
        return int(v.strip())
    except ValueError:
        return None


class WelfordAccumulator:
    """One-pass online mean and variance (Welford's algorithm)."""
    __slots__ = ("n", "mean", "M2")

    def __init__(self):
        self.n = 0
        self.mean = 0.0
        self.M2 = 0.0

    def update(self, x: float) -> None:
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        self.M2 += delta * (x - self.mean)

    @property
    def variance(self) -> float:
        return self.M2 / self.n if self.n > 1 else 0.0

    @property
    def std(self) -> float:
        return math.sqrt(self.variance)


def main() -> None:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Not found: {DATASET_PATH}")

    print(f"Profiling: {DATASET_PATH.name} ...")
    generated_at = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    # Accumulators
    total = 0
    exact_dup_rows = 0          # fully duplicate rows (all 7 fields identical)
    pk_dup_count = 0            # same PK tuple, different values

    null_counts: Counter = Counter()
    neg_volume = 0
    neg_bill = 0
    zero_volume = 0
    year_bad = 0
    month_bad = 0

    outlet_set: set = set()
    dist_set: set = set()
    sku_set: set = set()

    year_counts: Counter = Counter()
    month_counts: Counter = Counter()

    # Per-outlet volume accumulator (Welford)
    outlet_vol_acc: dict[str, WelfordAccumulator] = {}
    outlet_vol_min: dict[str, float] = {}
    outlet_vol_max: dict[str, float] = {}

    # PK tracking for duplicate detection
    pk_seen: set = set()
    # Full-row tracking for exact duplicates (hash of full row string)
    row_seen: set = set()

    # Track latest month per outlet for blackout detection
    outlet_latest_month: dict[str, tuple[int, int]] = {}  # outlet -> (year, month)

    with DATASET_PATH.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            total += 1

            # Null check
            for col in REQUIRED_COLUMNS:
                if row.get(col, "").strip() == "":
                    null_counts[col] += 1

            # Exact duplicate detection (hash of concatenated fields)
            row_key = "|".join(row.get(c, "").strip() for c in REQUIRED_COLUMNS)
            if row_key in row_seen:
                exact_dup_rows += 1
            else:
                row_seen.add(row_key)

            # PK duplicate detection
            pk_key = tuple(row.get(f, "").strip() for f in PK_FIELDS)
            if pk_key in pk_seen:
                pk_dup_count += 1
            else:
                pk_seen.add(pk_key)

            # Volume
            vol = parse_float(row.get("Volume_Liters", ""))
            if vol is not None:
                if vol < 0:
                    neg_volume += 1
                if vol == 0.0:
                    zero_volume += 1

            # Bill value
            bill = parse_float(row.get("Total_Bill_Value", ""))
            if bill is not None and bill < 0:
                neg_bill += 1

            # Year/month range
            yr = parse_int(row.get("Year", ""))
            mo = parse_int(row.get("Month", ""))
            if yr is not None:
                year_counts[yr] += 1
                if yr < 2023 or yr > 2025:
                    year_bad += 1
            if mo is not None:
                month_counts[mo] += 1
                if mo < 1 or mo > 12:
                    month_bad += 1

            # Cardinality
            oid = row.get("Outlet_ID", "").strip()
            did = row.get("Distributor_ID", "").strip()
            sid = row.get("SKU_ID", "").strip()
            if oid:
                outlet_set.add(oid)
            if did:
                dist_set.add(did)
            if sid:
                sku_set.add(sid)

            # Per-outlet volume stats
            if oid and vol is not None:
                if oid not in outlet_vol_acc:
                    outlet_vol_acc[oid] = WelfordAccumulator()
                    outlet_vol_min[oid] = vol
                    outlet_vol_max[oid] = vol
                outlet_vol_acc[oid].update(vol)
                if vol < outlet_vol_min[oid]:
                    outlet_vol_min[oid] = vol
                if vol > outlet_vol_max[oid]:
                    outlet_vol_max[oid] = vol

            # Track latest observation per outlet
            if oid and yr is not None and mo is not None:
                current = outlet_latest_month.get(oid, (0, 0))
                if (yr, mo) > current:
                    outlet_latest_month[oid] = (yr, mo)

            if total % CHUNK_SIZE == 0:
                print(f"  Processed {total:,} rows ...")

    # Outlets whose last recorded month is before Dec 2025 (potential blackouts)
    blackout_outlets = sum(
        1 for oid, (yr, mo) in outlet_latest_month.items()
        if (yr, mo) < (2025, 12)
    )

    # Outlets never appearing in 2025
    outlets_missing_2025 = 0
    outlet_years: dict[str, set] = {}
    # Need another pass for this — skip to keep single pass, use latest month heuristic
    # Approximate: outlets whose last month is < 2025-01
    outlets_dropped_before_2025 = sum(
        1 for oid, (yr, mo) in outlet_latest_month.items()
        if yr < 2025
    )

    # Write metrics
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["metric", "value", "note"])
        writer.writerow(["generated_at", generated_at, ""])
        writer.writerow(["total_rows", total, ""])
        writer.writerow(["exact_duplicate_rows", exact_dup_rows, "All 7 fields identical"])
        writer.writerow(["pk_duplicate_rows", pk_dup_count, "Same (Outlet,Year,Month,Dist,SKU) different values"])
        writer.writerow(["distinct_outlets", len(outlet_set), ""])
        writer.writerow(["distinct_distributors", len(dist_set), ""])
        writer.writerow(["distinct_skus", len(sku_set), ""])

        for col in REQUIRED_COLUMNS:
            writer.writerow([f"null_{col}", null_counts[col], ""])

        writer.writerow(["negative_Volume_Liters", neg_volume, "Possible censoring artifact or data error"])
        writer.writerow(["zero_Volume_Liters", zero_volume, "Zero-volume transactions"])
        writer.writerow(["negative_Total_Bill_Value", neg_bill, "Returns, credits, or data error"])
        writer.writerow(["out_of_range_Year", year_bad, "Year outside 2023–2025"])
        writer.writerow(["out_of_range_Month", month_bad, "Month outside 1–12"])
        writer.writerow(["blackout_outlets_missing_dec2025", blackout_outlets,
                         "Outlets whose last record is before Dec 2025"])
        writer.writerow(["outlets_dropped_before_2025", outlets_dropped_before_2025,
                         "Outlets with no data in 2025 at all"])

        for yr, cnt in sorted(year_counts.items()):
            writer.writerow([f"year_{yr}", cnt, ""])
        for mo, cnt in sorted(month_counts.items()):
            writer.writerow([f"month_{mo}", cnt, ""])

        # Summary per-outlet volume stats
        all_means = [acc.mean for acc in outlet_vol_acc.values() if acc.n > 0]
        all_stds = [acc.std for acc in outlet_vol_acc.values() if acc.n > 1]
        overall_min_vol = min(outlet_vol_min.values()) if outlet_vol_min else None
        overall_max_vol = max(outlet_vol_max.values()) if outlet_vol_max else None
        mean_of_means = sum(all_means) / len(all_means) if all_means else None
        mean_of_stds = sum(all_stds) / len(all_stds) if all_stds else None

        writer.writerow(["overall_volume_min", overall_min_vol, "Minimum across all outlets"])
        writer.writerow(["overall_volume_max", overall_max_vol, "Maximum across all outlets"])
        writer.writerow(["mean_outlet_mean_volume", round(mean_of_means, 4) if mean_of_means else "", "Average of per-outlet means"])
        writer.writerow(["mean_outlet_std_volume", round(mean_of_stds, 4) if mean_of_stds else "", "Average of per-outlet std devs"])

    print(f"\nEnhanced profile written -> {OUTPUT_PATH}")

    # Console summary
    print("\n-- Summary ------------------------------------------")
    print(f"  Total rows           : {total:,}")
    print(f"  Exact duplicate rows : {exact_dup_rows:,}")
    print(f"  PK duplicate rows    : {pk_dup_count:,}")
    print(f"  Distinct outlets     : {len(outlet_set):,}")
    print(f"  Distinct distributors: {len(dist_set):,}")
    print(f"  Distinct SKUs        : {len(sku_set):,}")
    print(f"  Negative volumes     : {neg_volume:,}  <- anomaly")
    print(f"  Negative bill values : {neg_bill:,}  <- anomaly")
    print(f"  Outlets missing Dec-2025 data: {blackout_outlets:,}  <- potential blackout")


if __name__ == "__main__":
    main()
