"""
phase2_silver.py — Silver Layer Cleaning & Quarantine Pipeline
==============================================================
Phase 2 / Steps 4 & 5:
  - Applies reusable DE checks from de_checks.py to every dataset
  - Writes cleaned records  → silver/clean/<dataset>.csv
  - Writes rejected records → silver/quarantine/<dataset>_quarantined.csv
  - Writes audit log        → metadata/silver_audit.csv

Design decisions
----------------
- Records are NEVER silently dropped; all rejects land in quarantine with a
  documented failure_reason code.
- transactions_history_final.csv is processed in a single streaming pass
  (to avoid loading 2.3M rows into memory twice). PK-seen set is kept in
  memory (~90 MB for 2.3M string keys).
- Small datasets (<100k rows) are loaded fully into memory.
- Normalisation (typo correction) happens BEFORE checks so clean values
  are validated, not the raw misspellings.
- Outlet_Size null rows: quarantined for the audit record AND written to
  clean with the null preserved — so all 20,000 outlets stay in the clean
  outlet_master for downstream Gold enrichment.
"""
from __future__ import annotations

import csv
import datetime as dt
import sys
from pathlib import Path

# ── Path setup ────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parents[1]
BRONZE_RAW = ROOT / "bronze" / "raw"
SILVER_CLEAN = ROOT / "silver" / "clean"
SILVER_QUARANTINE = ROOT / "silver" / "quarantine"
METADATA = ROOT / "metadata"
AUDIT_PATH = METADATA / "silver_audit.csv"

# Add src to path so we can import de_checks
sys.path.insert(0, str(ROOT / "src"))

from de_checks import (
    CheckSummary,
    RC_DUPLICATE,
    RC_NULL,
    RC_RANGE,
    RC_REFERENTIAL,
    check_duplicates,
    check_nulls,
    check_referential_integrity,
    check_value_range,
    check_format_type,
    normalize_categorical,
    strip_whitespace,
)

CHUNK_SIZE = 250_000


# ── I/O helpers ───────────────────────────────────────────────────────────────

def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        return list(csv.DictReader(fh))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str] | None = None) -> None:
    if not rows:
        path.touch()
        return
    fields = fieldnames or list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_quarantine(path: Path, rows: list[dict], source_fields: list[str]) -> None:
    if not rows:
        path.touch()
        return
    fields = source_fields + ["failure_reason"]
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def parse_float(v: str) -> float | None:
    try:
        return float(v.strip())
    except (ValueError, AttributeError):
        return None


def parse_int(v: str) -> int | None:
    try:
        return int(v.strip())
    except (ValueError, AttributeError):
        return None


# ── Dataset 1: transactions_history_final.csv (streaming) ────────────────────

TRANSACTIONS_FIELDS = [
    "Outlet_ID", "Year", "Month", "Distributor_ID", "SKU_ID",
    "Volume_Liters", "Total_Bill_Value",
]
TRANSACTIONS_PK = ["Outlet_ID", "Year", "Month", "Distributor_ID", "SKU_ID"]


def process_transactions(summary: CheckSummary) -> None:
    """Single-pass streaming clean for the large transactions file."""
    src = BRONZE_RAW / "transactions_history_final.csv"
    clean_path = SILVER_CLEAN / "transactions_history_final.csv"
    quar_path = SILVER_QUARANTINE / "transactions_history_final_quarantined.csv"

    quar_fields = TRANSACTIONS_FIELDS + ["failure_reason"]

    # ── Pre-load reference sets for Referential Integrity checks ─────────────
    # Outlet_ID must exist in outlet_master
    valid_outlet_ids: set[str] = set()
    with (BRONZE_RAW / "outlet_master.csv").open("r", encoding="utf-8-sig", errors="replace") as fh:
        for row in csv.DictReader(fh):
            oid = row.get("Outlet_ID", "").strip()
            if oid:
                valid_outlet_ids.add(oid)

    # Distributor_ID must exist in distributor_seasonality_details
    valid_dist_ids: set[str] = set()
    with (BRONZE_RAW / "distributor_seasonality_details.csv").open("r", encoding="utf-8-sig", errors="replace") as fh:
        for row in csv.DictReader(fh):
            did = row.get("Distributor_ID", "").strip()
            if did:
                valid_dist_ids.add(did)

    print(f"  [RI refs] outlet_master: {len(valid_outlet_ids)} IDs | "
          f"distributors: {len(valid_dist_ids)} IDs")

    pk_seen: set[str] = set()

    total = 0
    n_clean = 0
    n_dup = 0
    n_neg_vol = 0
    n_range = 0
    n_ri = 0

    with (
        src.open("r", encoding="utf-8-sig", errors="replace", newline="") as src_fh,
        clean_path.open("w", encoding="utf-8", newline="") as clean_fh,
        quar_path.open("w", encoding="utf-8", newline="") as quar_fh,
    ):
        reader = csv.DictReader(src_fh)

        clean_writer = csv.DictWriter(clean_fh, fieldnames=TRANSACTIONS_FIELDS)
        clean_writer.writeheader()

        quar_writer = csv.DictWriter(quar_fh, fieldnames=quar_fields, extrasaction="ignore")
        quar_writer.writeheader()

        for row in reader:
            total += 1

            # ── Check 1: Duplicate (PK) ──────────────────────────────────────
            pk_key = "|".join(row.get(f, "").strip() for f in TRANSACTIONS_PK)
            if pk_key in pk_seen:
                row["failure_reason"] = RC_DUPLICATE
                quar_writer.writerow(row)
                n_dup += 1
                if total % CHUNK_SIZE == 0:
                    print(f"  [transactions] {total:,} rows processed ...")
                continue
            pk_seen.add(pk_key)

            # ── Check 2: Value range — Volume_Liters must be >= 0 ────────────
            vol_raw = row.get("Volume_Liters", "").strip()
            vol = parse_float(vol_raw)
            if vol is not None and vol < 0:
                row["failure_reason"] = f"{RC_RANGE}:Volume_Liters={vol_raw}"
                quar_writer.writerow(row)
                n_neg_vol += 1
                if total % CHUNK_SIZE == 0:
                    print(f"  [transactions] {total:,} rows processed ...")
                continue

            # ── Check 3: Year range 2023–2025 ────────────────────────────────
            yr = parse_int(row.get("Year", ""))
            mo = parse_int(row.get("Month", ""))
            if yr is not None and (yr < 2023 or yr > 2025):
                row["failure_reason"] = f"{RC_RANGE}:Year={yr}"
                quar_writer.writerow(row)
                n_range += 1
                if total % CHUNK_SIZE == 0:
                    print(f"  [transactions] {total:,} rows processed ...")
                continue
            if mo is not None and (mo < 1 or mo > 12):
                row["failure_reason"] = f"{RC_RANGE}:Month={mo}"
                quar_writer.writerow(row)
                n_range += 1
                if total % CHUNK_SIZE == 0:
                    print(f"  [transactions] {total:,} rows processed ...")
                continue

            # ── Check 4: Referential Integrity — Outlet_ID ───────────────────
            oid = row.get("Outlet_ID", "").strip()
            if oid and oid not in valid_outlet_ids:
                row["failure_reason"] = f"{RC_REFERENTIAL}:Outlet_ID={oid}"
                quar_writer.writerow(row)
                n_ri += 1
                if total % CHUNK_SIZE == 0:
                    print(f"  [transactions] {total:,} rows processed ...")
                continue

            # ── Check 5: Referential Integrity — Distributor_ID ──────────────
            did = row.get("Distributor_ID", "").strip()
            if did and did not in valid_dist_ids:
                row["failure_reason"] = f"{RC_REFERENTIAL}:Distributor_ID={did}"
                quar_writer.writerow(row)
                n_ri += 1
                if total % CHUNK_SIZE == 0:
                    print(f"  [transactions] {total:,} rows processed ...")
                continue

            # ── Passed all checks ─────────────────────────────────────────────
            clean_writer.writerow({k: row.get(k, "").strip() for k in TRANSACTIONS_FIELDS})
            n_clean += 1

            if total % CHUNK_SIZE == 0:
                print(f"  [transactions] {total:,} rows processed ...")

    summary.rows_input = total
    summary.rows_clean = n_clean
    summary.quarantine_counts[RC_DUPLICATE] = n_dup
    summary.quarantine_counts[RC_RANGE] = n_neg_vol + n_range
    summary.quarantine_counts[RC_REFERENTIAL] = n_ri

    print(f"  transactions: {total:,} in | {n_clean:,} clean | "
          f"{n_dup:,} pk_dup | {n_neg_vol:,} neg_vol | "
          f"{n_range:,} range_fail | {n_ri:,} ri_fail")


# ── Dataset 2: outlet_master.csv ──────────────────────────────────────────────

OUTLET_MASTER_FIELDS = ["Outlet_ID", "Outlet_Size", "Cooler_Count", "Outlet_Type"]

# Known typo mappings (normalise BEFORE check)
OUTLET_TYPE_MAP = {
    "Grocry": "Grocery",
    "Bakry": "Bakery",
}
OUTLET_SIZE_MAP = {
    "small": "Small",
}


def process_outlet_master(summary: CheckSummary) -> None:
    src = BRONZE_RAW / "outlet_master.csv"
    clean_path = SILVER_CLEAN / "outlet_master.csv"
    quar_path = SILVER_QUARANTINE / "outlet_master_quarantined.csv"

    rows = read_csv(src)
    summary.rows_input = len(rows)

    # ── Strip whitespace from all fields (catches ' Eatery ' etc.) ────────────
    rows, n_ws = strip_whitespace(rows)
    summary.record_transform("whitespace_stripped_cells", n_ws)

    # ── Normalise typos (transform only, no quarantine) ───────────────────────
    rows, n_type = normalize_categorical(rows, "Outlet_Type", OUTLET_TYPE_MAP)
    rows, n_size = normalize_categorical(rows, "Outlet_Size", OUTLET_SIZE_MAP,
                                         case_insensitive=True)
    summary.record_transform("outlet_type_normalised", n_type)
    summary.record_transform("outlet_size_normalised", n_size)
    print(f"  outlet_master: normalised {n_type} Outlet_Type, {n_size} Outlet_Size values")

    # ── Check 1: PK duplicates ────────────────────────────────────────────────
    clean, quar_dup = check_duplicates(rows, pk_fields=["Outlet_ID"])
    summary.record_quarantine(quar_dup)

    # ── Check 2: Null required fields ─────────────────────────────────────────
    # Outlet_Size is required but 196 are null. We quarantine them for the
    # audit record but ALSO write them to clean so all 20k outlets are
    # available for Gold enrichment. Downstream imputation handles nulls.
    clean_no_null, quar_null = check_nulls(clean, required_fields=["Outlet_ID"])
    summary.record_quarantine(quar_null)

    # Separate out the null-Outlet_Size rows for the quarantine log
    _, quar_size_null = check_nulls(clean, required_fields=["Outlet_ID", "Outlet_Size"])
    # These go to quarantine log but STAY in the clean file
    summary.record_quarantine([r for r in quar_size_null if r not in quar_null])

    # ── Check 3: Cooler_Count must be a non-negative integer ──────────────────
    clean_typed, quar_type = check_value_range(
        clean_no_null, field="Cooler_Count",
        min_val=0, parser=parse_int, allow_null=True,
    )
    summary.record_quarantine(quar_type)

    # ── Write clean (ALL rows including null Outlet_Size — for Gold completeness)
    write_csv(clean_path, clean, fieldnames=OUTLET_MASTER_FIELDS)

    # ── Quarantine: PK dups + null Outlet_ID + bad Cooler_Count + null Outlet_Size
    all_quar = quar_dup + quar_null + quar_type + [
        r for r in quar_size_null if r not in quar_null
    ]
    write_quarantine(quar_path, all_quar, OUTLET_MASTER_FIELDS)

    summary.rows_clean = len(clean)
    print(f"  outlet_master: {summary.rows_input} in | {summary.rows_clean} clean | "
          f"{len(all_quar)} quarantine entries")


# ── Dataset 3: outlet_coordinates.csv ────────────────────────────────────────

OUTLET_COORDS_FIELDS = ["Outlet_ID", "Latitude", "Longitude"]


def process_outlet_coordinates(summary: CheckSummary) -> None:
    src = BRONZE_RAW / "outlet_coordinates.csv"
    clean_path = SILVER_CLEAN / "outlet_coordinates.csv"
    quar_path = SILVER_QUARANTINE / "outlet_coordinates_quarantined.csv"

    rows = read_csv(src)
    summary.rows_input = len(rows)

    # Strip whitespace
    rows, n_ws = strip_whitespace(rows)
    summary.record_transform("whitespace_stripped_cells", n_ws)

    # Check 1: PK duplicates
    clean, quar_dup = check_duplicates(rows, pk_fields=["Outlet_ID"])
    summary.record_quarantine(quar_dup)

    # Check 2: Null required fields
    clean, quar_null = check_nulls(clean, required_fields=OUTLET_COORDS_FIELDS)
    summary.record_quarantine(quar_null)

    # Check 3: Latitude range -90 to 90
    clean, quar_lat = check_value_range(
        clean, field="Latitude", min_val=-90.0, max_val=90.0, allow_null=False,
    )
    summary.record_quarantine(quar_lat)

    # Check 4: Longitude range -180 to 180
    clean, quar_lon = check_value_range(
        clean, field="Longitude", min_val=-180.0, max_val=180.0, allow_null=False,
    )
    summary.record_quarantine(quar_lon)

    # Check 5: Format — Latitude and Longitude must be parseable floats
    clean, quar_fmt_lat = check_format_type(clean, field="Latitude", parser=parse_float, allow_null=False)
    clean, quar_fmt_lon = check_format_type(clean, field="Longitude", parser=parse_float, allow_null=False)
    summary.record_quarantine(quar_fmt_lat + quar_fmt_lon)

    # Check 6: Referential Integrity — Outlet_ID must exist in outlet_master
    master_ids = {
        r["Outlet_ID"].strip()
        for r in read_csv(SILVER_CLEAN / "outlet_master.csv")
        if r.get("Outlet_ID", "").strip()
    }
    clean, quar_ri = check_referential_integrity(clean, fk_field="Outlet_ID", ref_set=master_ids)
    summary.record_quarantine(quar_ri)

    write_csv(clean_path, clean, fieldnames=OUTLET_COORDS_FIELDS)
    all_quar = quar_dup + quar_null + quar_lat + quar_lon + quar_fmt_lat + quar_fmt_lon + quar_ri
    write_quarantine(quar_path, all_quar, OUTLET_COORDS_FIELDS)

    summary.rows_clean = len(clean)
    print(f"  outlet_coordinates: {summary.rows_input} in | {summary.rows_clean} clean | "
          f"{len(all_quar)} quarantine entries")


# ── Dataset 4: distributor_seasonality_details.csv ───────────────────────────

SEASONALITY_FIELDS = ["Distributor_ID", "Year", "Month", "Seasonality_Index"]
VALID_SEASONALITY = {"Moderate", "Favorable", "Un-Favorable"}


def process_distributor_seasonality(summary: CheckSummary) -> None:
    src = BRONZE_RAW / "distributor_seasonality_details.csv"
    clean_path = SILVER_CLEAN / "distributor_seasonality_details.csv"
    quar_path = SILVER_QUARANTINE / "distributor_seasonality_details_quarantined.csv"

    rows = read_csv(src)
    summary.rows_input = len(rows)

    # Strip whitespace
    rows, n_ws = strip_whitespace(rows)
    summary.record_transform("whitespace_stripped_cells", n_ws)

    # Check 1: PK duplicates
    clean, quar_dup = check_duplicates(rows, pk_fields=["Distributor_ID", "Year", "Month"])
    summary.record_quarantine(quar_dup)

    # Check 2: Null required fields
    clean, quar_null = check_nulls(clean, required_fields=SEASONALITY_FIELDS)
    summary.record_quarantine(quar_null)

    # Check 3: Year range
    clean, quar_yr = check_value_range(
        clean, field="Year", min_val=2023, max_val=2025, parser=parse_int, allow_null=False,
    )
    summary.record_quarantine(quar_yr)

    # Check 4: Month range
    clean, quar_mo = check_value_range(
        clean, field="Month", min_val=1, max_val=12, parser=parse_int, allow_null=False,
    )
    summary.record_quarantine(quar_mo)

    # Check 5: Seasonality_Index must be a known value
    invalid_si = [r for r in clean if r.get("Seasonality_Index", "").strip() not in VALID_SEASONALITY]
    clean = [r for r in clean if r.get("Seasonality_Index", "").strip() in VALID_SEASONALITY]
    for r in invalid_si:
        r["failure_reason"] = f"invalid_category:Seasonality_Index={r.get('Seasonality_Index')}"
    summary.quarantine_counts["invalid_category"] += len(invalid_si)

    write_csv(clean_path, clean, fieldnames=SEASONALITY_FIELDS)
    all_quar = quar_dup + quar_null + quar_yr + quar_mo + invalid_si
    write_quarantine(quar_path, all_quar, SEASONALITY_FIELDS)

    summary.rows_clean = len(clean)
    print(f"  distributor_seasonality: {summary.rows_input} in | {summary.rows_clean} clean | "
          f"{len(all_quar)} quarantine entries")


# ── Dataset 5: holiday_list.csv ───────────────────────────────────────────────

HOLIDAY_FIELDS = ["Date", "Holiday_Name", "Holiday_Type"]


def process_holiday_list(summary: CheckSummary) -> None:
    src = BRONZE_RAW / "holiday_list.csv"
    clean_path = SILVER_CLEAN / "holiday_list.csv"
    quar_path = SILVER_QUARANTINE / "holiday_list_quarantined.csv"

    rows = read_csv(src)
    summary.rows_input = len(rows)

    # Strip whitespace
    rows, n_ws = strip_whitespace(rows)
    summary.record_transform("whitespace_stripped_cells", n_ws)

    # Check 1: PK duplicates (Date + Holiday_Name)
    clean, quar_dup = check_duplicates(rows, pk_fields=["Date", "Holiday_Name"])
    summary.record_quarantine(quar_dup)

    # Check 2: Null required fields
    clean, quar_null = check_nulls(clean, required_fields=["Date", "Holiday_Name"])
    summary.record_quarantine(quar_null)

    write_csv(clean_path, clean, fieldnames=HOLIDAY_FIELDS)
    all_quar = quar_dup + quar_null
    write_quarantine(quar_path, all_quar, HOLIDAY_FIELDS)

    summary.rows_clean = len(clean)
    print(f"  holiday_list: {summary.rows_input} in | {summary.rows_clean} clean | "
          f"{len(all_quar)} quarantine entries")


# ── Audit log ─────────────────────────────────────────────────────────────────

def write_audit(summaries: list[CheckSummary], generated_at: str) -> None:
    fieldnames = [
        "dataset", "rows_input", "rows_clean", "rows_quarantined",
        "pct_quarantined", "top_failure_reasons", "transforms", "generated_at",
    ]
    with AUDIT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for s in summaries:
            writer.writerow({
                "dataset": s.dataset,
                "rows_input": s.rows_input,
                "rows_clean": s.rows_clean,
                "rows_quarantined": s.rows_quarantined,
                "pct_quarantined": s.pct_quarantined,
                "top_failure_reasons": s.top_failure_reasons(),
                "transforms": "; ".join(f"{k}={v}" for k, v in s.transform_counts.items()),
                "generated_at": generated_at,
            })
    print(f"\nAudit log -> {AUDIT_PATH}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    SILVER_CLEAN.mkdir(parents=True, exist_ok=True)
    SILVER_QUARANTINE.mkdir(parents=True, exist_ok=True)
    METADATA.mkdir(parents=True, exist_ok=True)

    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    print("=== Phase 2 - Silver Cleaning & Quarantine ===\n")

    summaries: list[CheckSummary] = []

    # ── transactions (streaming) ──────────────────────────────────────────────
    print("[1/5] transactions_history_final.csv (streaming, 2.3M rows) ...")
    s_tx = CheckSummary("transactions_history_final.csv", 0)
    process_transactions(s_tx)
    summaries.append(s_tx)

    # ── outlet_master ─────────────────────────────────────────────────────────
    print("\n[2/5] outlet_master.csv ...")
    s_om = CheckSummary("outlet_master.csv", 0)
    process_outlet_master(s_om)
    summaries.append(s_om)

    # ── outlet_coordinates ────────────────────────────────────────────────────
    print("\n[3/5] outlet_coordinates.csv ...")
    s_oc = CheckSummary("outlet_coordinates.csv", 0)
    process_outlet_coordinates(s_oc)
    summaries.append(s_oc)

    # ── distributor_seasonality ───────────────────────────────────────────────
    print("\n[4/5] distributor_seasonality_details.csv ...")
    s_ds = CheckSummary("distributor_seasonality_details.csv", 0)
    process_distributor_seasonality(s_ds)
    summaries.append(s_ds)

    # ── holiday_list ──────────────────────────────────────────────────────────
    print("\n[5/5] holiday_list.csv ...")
    s_hl = CheckSummary("holiday_list.csv", 0)
    process_holiday_list(s_hl)
    summaries.append(s_hl)

    # ── Audit report ──────────────────────────────────────────────────────────
    write_audit(summaries, generated_at)

    print("\n=== Silver Audit Summary ===")
    print(f"{'Dataset':<45} {'In':>8} {'Clean':>8} {'Quarantined':>12} {'%':>6}")
    print("-" * 82)
    for s in summaries:
        print(f"{s.dataset:<45} {s.rows_input:>8,} {s.rows_clean:>8,} "
              f"{s.rows_quarantined:>12,} {s.pct_quarantined:>5.1f}%")

    total_q = sum(s.rows_quarantined for s in summaries)
    print(f"\nTotal quarantined records: {total_q:,}")
    print("\nPhase 2 complete.")


if __name__ == "__main__":
    main()
