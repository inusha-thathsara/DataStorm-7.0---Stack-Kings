"""
Phase 1 – Step 1: Scope & Data Forensics
=========================================
Inventories all provided datasets, confirms schema consistency, and lists
known artifacts: ghost entries, duplicates, type mismatches, out-of-range
values, and referential integrity gaps.

Output: metadata/forensics_report.csv
"""
from __future__ import annotations

import csv
import datetime as dt
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRONZE_RAW = ROOT / "bronze" / "raw"
METADATA = ROOT / "metadata"
REPORT_PATH = METADATA / "forensics_report.csv"

# ── Schema definition (mirrors schema.yml) ────────────────────────────────────
SCHEMAS: dict[str, dict] = {
    "transactions_history_final.csv": {
        "primary_key": ["Outlet_ID", "Year", "Month", "Distributor_ID", "SKU_ID"],
        "required": ["Outlet_ID", "Year", "Month", "Distributor_ID", "SKU_ID", "Volume_Liters"],
        "int_fields": ["Year", "Month"],
        "float_fields": ["Volume_Liters", "Total_Bill_Value"],
        "year_range": (2023, 2025),
        "month_range": (1, 12),
    },
    "outlet_master.csv": {
        "primary_key": ["Outlet_ID"],
        "required": ["Outlet_ID", "Outlet_Size", "Cooler_Count", "Outlet_Type"],
        "int_fields": ["Cooler_Count"],
        "float_fields": [],
    },
    "outlet_coordinates.csv": {
        "primary_key": ["Outlet_ID"],
        "required": ["Outlet_ID", "Latitude", "Longitude"],
        "int_fields": [],
        "float_fields": ["Latitude", "Longitude"],
        "lat_range": (-90.0, 90.0),
        "lon_range": (-180.0, 180.0),
    },
    "distributor_seasonality_details.csv": {
        "primary_key": ["Distributor_ID", "Year", "Month"],
        "required": ["Distributor_ID", "Year", "Month", "Seasonality_Index"],
        "int_fields": ["Year", "Month"],
        "float_fields": [],
    },
    "holiday_list.csv": {
        "primary_key": ["Date", "Holiday_Name"],
        "required": ["Date", "Holiday_Name"],
        "int_fields": [],
        "float_fields": [],
    },
}

CHUNK_SIZE = 250_000


def iter_rows_csv(path: Path) -> list[dict[str, str]]:
    """Read a CSV and yield rows as dicts (full file, not chunked — used for small files)."""
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        return list(reader)


def iter_rows_chunked(path: Path):
    """Yield rows one at a time for large files."""
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            yield row


def parse_float(v: str) -> float | None:
    if v is None:
        return None
    v = v.strip()
    try:
        return float(v)
    except ValueError:
        return None


def parse_int(v: str) -> int | None:
    if v is None:
        return None
    v = v.strip()
    try:
        return int(v)
    except ValueError:
        return None


def forensics_large(filename: str, schema: dict, path: Path) -> tuple[list[dict], set[str]]:
    """Chunked forensics for transactions_history_final.csv."""
    findings: list[dict] = []
    pk_fields = schema["primary_key"]
    required = schema["required"]

    total = 0
    null_counts: Counter = Counter()
    bad_type: Counter = Counter()
    neg_volume = 0
    neg_bill = 0
    year_bad = 0
    month_bad = 0
    lat_bad = 0
    lon_bad = 0
    pk_seen: set = set()
    pk_dups = 0
    outlet_set: set = set()
    dist_set: set = set()
    sku_set: set = set()

    yr0, yr1 = schema.get("year_range", (None, None))
    mo0, mo1 = schema.get("month_range", (None, None))

    for row in iter_rows_chunked(path):
        total += 1

        # nulls / required
        for col in required:
            if row.get(col, "").strip() == "":
                null_counts[col] += 1

        # type checks
        for col in schema.get("int_fields", []):
            if parse_int(row.get(col, "")) is None and row.get(col, "").strip() != "":
                bad_type[col] += 1
        for col in schema.get("float_fields", []):
            if parse_float(row.get(col, "")) is None and row.get(col, "").strip() != "":
                bad_type[col] += 1

        # range checks
        vol = parse_float(row.get("Volume_Liters", ""))
        if vol is not None and vol < 0:
            neg_volume += 1

        bill = parse_float(row.get("Total_Bill_Value", ""))
        if bill is not None and bill < 0:
            neg_bill += 1

        yr = parse_int(row.get("Year", ""))
        if yr is not None and yr0 and (yr < yr0 or yr > yr1):
            year_bad += 1

        mo = parse_int(row.get("Month", ""))
        if mo is not None and mo0 and (mo < mo0 or mo > mo1):
            month_bad += 1

        # cardinality sets
        oid = row.get("Outlet_ID", "").strip()
        did = row.get("Distributor_ID", "").strip()
        sid = row.get("SKU_ID", "").strip()
        if oid:
            outlet_set.add(oid)
        if did:
            dist_set.add(did)
        if sid:
            sku_set.add(sid)

        # PK duplicates (sampled — track key tuple)
        pk_key = tuple(row.get(f, "").strip() for f in pk_fields)
        if pk_key in pk_seen:
            pk_dups += 1
        else:
            pk_seen.add(pk_key)

        if total % CHUNK_SIZE == 0:
            print(f"  [transactions] processed {total:,} rows...")

    def add(check, detail, count, note=""):
        findings.append({
            "dataset": filename,
            "check": check,
            "artifact_type": detail,
            "count": count,
            "note": note,
        })

    add("total_rows", "info", total)
    add("distinct_outlets", "info", len(outlet_set))
    add("distinct_distributors", "info", len(dist_set))
    add("distinct_skus", "info", len(sku_set))
    add("pk_duplicates", "duplicate", pk_dups, "Same (Outlet,Year,Month,Dist,SKU) tuple")
    for col in required:
        add(f"null_{col}", "null", null_counts[col])
    for col, cnt in bad_type.items():
        add(f"bad_type_{col}", "type_mismatch", cnt)
    add("negative_Volume_Liters", "anomaly", neg_volume, "Volume < 0 (censoring artifact?)")
    add("negative_Total_Bill_Value", "anomaly", neg_bill, "Bill < 0 (returns/credits?)")
    add("out_of_range_Year", "anomaly", year_bad, f"Expected {yr0}–{yr1}")
    add("out_of_range_Month", "anomaly", month_bad, f"Expected {mo0}–{mo1}")

    return findings, outlet_set


def forensics_small(filename: str, schema: dict, path: Path) -> list[dict]:
    """Full in-memory forensics for small datasets."""
    findings: list[dict] = []
    rows = iter_rows_csv(path)
    total = len(rows)
    pk_fields = schema["primary_key"]
    required = schema["required"]

    null_counts: Counter = Counter()
    bad_type: Counter = Counter()
    pk_counter: Counter = Counter()

    outlet_ids: set = set()

    for row in rows:
        for col in required:
            if row.get(col, "").strip() == "":
                null_counts[col] += 1
        for col in schema.get("int_fields", []):
            if parse_int(row.get(col, "")) is None and row.get(col, "").strip() != "":
                bad_type[col] += 1
        for col in schema.get("float_fields", []):
            if parse_float(row.get(col, "")) is None and row.get(col, "").strip() != "":
                bad_type[col] += 1

        lat_range = schema.get("lat_range")
        lon_range = schema.get("lon_range")
        if lat_range:
            lat = parse_float(row.get("Latitude", ""))
            if lat is not None and not (lat_range[0] <= lat <= lat_range[1]):
                bad_type["Latitude_out_of_range"] += 1
        if lon_range:
            lon = parse_float(row.get("Longitude", ""))
            if lon is not None and not (lon_range[0] <= lon <= lon_range[1]):
                bad_type["Longitude_out_of_range"] += 1

        pk_key = tuple(row.get(f, "").strip() for f in pk_fields)
        pk_counter[pk_key] += 1

        if "Outlet_ID" in row:
            outlet_ids.add(row["Outlet_ID"].strip())

    pk_dups = sum(c - 1 for c in pk_counter.values() if c > 1)

    def add(check, detail, count, note=""):
        findings.append({
            "dataset": filename,
            "check": check,
            "artifact_type": detail,
            "count": count,
            "note": note,
        })

    add("total_rows", "info", total)
    if "Outlet_ID" in required:
        add("distinct_outlets", "info", len(outlet_ids))
    add("pk_duplicates", "duplicate", pk_dups)
    for col in required:
        add(f"null_{col}", "null", null_counts[col])
    for col, cnt in bad_type.items():
        add(f"bad_type_{col}", "type_mismatch", cnt)

    return findings


def check_referential_integrity(
    transactions_outlet_ids: set[str],
    master_outlet_ids: set[str],
    coord_outlet_ids: set[str],
) -> list[dict]:
    """Check which outlet IDs from transactions appear in master / coordinates."""
    findings = []

    in_tx_not_master = transactions_outlet_ids - master_outlet_ids
    in_master_not_tx = master_outlet_ids - transactions_outlet_ids
    in_tx_not_coords = transactions_outlet_ids - coord_outlet_ids
    in_coords_not_tx = coord_outlet_ids - transactions_outlet_ids

    def add(check, artifact_type, count, note=""):
        findings.append({
            "dataset": "cross_dataset",
            "check": check,
            "artifact_type": artifact_type,
            "count": count,
            "note": note,
        })

    add("outlets_in_tx_not_in_master", "referential_integrity", len(in_tx_not_master),
        "Outlets with sales but no master record — ghost outlets")
    add("outlets_in_master_not_in_tx", "referential_integrity", len(in_master_not_tx),
        "Outlets in master with no transactions — latent/inactive outlets")
    add("outlets_in_tx_not_in_coords", "referential_integrity", len(in_tx_not_coords),
        "Outlets with sales but no coordinates")
    add("outlets_in_coords_not_in_tx", "referential_integrity", len(in_coords_not_tx),
        "Outlets with coordinates but no transactions")

    return findings


def collect_outlet_ids_from_large(path: Path) -> set[str]:
    """Collect distinct Outlet_IDs from transactions in a single chunked pass."""
    ids: set[str] = set()
    total = 0
    for row in iter_rows_chunked(path):
        oid = row.get("Outlet_ID", "").strip()
        if oid:
            ids.add(oid)
        total += 1
        if total % CHUNK_SIZE == 0:
            print(f"  [referential] scanned {total:,} rows...")
    return ids


def main() -> None:
    METADATA.mkdir(parents=True, exist_ok=True)
    all_findings: list[dict] = []
    generated_at = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    print("=== Phase 1 – Data Forensics ===")

    # ── Per-dataset forensics ──────────────────────────────────────────────────
    tx_outlet_ids: set[str] = set()
    master_outlet_ids: set[str] = set()
    coord_outlet_ids: set[str] = set()

    for filename, schema in SCHEMAS.items():
        path = BRONZE_RAW / filename
        if not path.exists():
            all_findings.append({
                "dataset": filename,
                "check": "file_exists",
                "artifact_type": "missing",
                "count": 1,
                "note": "File not found in bronze/raw",
            })
            print(f"  MISSING: {filename}")
            continue

        print(f"  Profiling: {filename}")

        if filename == "transactions_history_final.csv":
            findings, tx_outlet_ids = forensics_large(filename, schema, path)
        else:
            findings = forensics_small(filename, schema, path)

        if filename == "outlet_master.csv":
            rows = iter_rows_csv(path)
            master_outlet_ids = {r["Outlet_ID"].strip() for r in rows if r.get("Outlet_ID", "").strip()}
        if filename == "outlet_coordinates.csv":
            rows = iter_rows_csv(path)
            coord_outlet_ids = {r["Outlet_ID"].strip() for r in rows if r.get("Outlet_ID", "").strip()}

        all_findings.extend(findings)

    # ── Cross-dataset referential integrity ────────────────────────────────────
    print("  Checking referential integrity...")
    ri_findings = check_referential_integrity(tx_outlet_ids, master_outlet_ids, coord_outlet_ids)
    all_findings.extend(ri_findings)

    # ── Write report ───────────────────────────────────────────────────────────
    fieldnames = ["dataset", "check", "artifact_type", "count", "note", "generated_at"]
    with REPORT_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for row in all_findings:
            row["generated_at"] = generated_at
            writer.writerow(row)

    print(f"\nForensics report written -> {REPORT_PATH}")
    print(f"Total findings: {len(all_findings)}")

    # Print summary of anomalies
    anomalies = [f for f in all_findings if f["artifact_type"] not in ("info",) and int(f["count"]) > 0]
    if anomalies:
        print("\n-- Artifacts found --")
        for f in anomalies:
            print(f"  [{f['artifact_type']}] {f['dataset']} / {f['check']}: {f['count']}"
                  + (f"  <- {f['note']}" if f['note'] else ""))
    else:
        print("\nNo artifacts detected.")


if __name__ == "__main__":
    main()
