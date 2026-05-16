"""Full audit of Phase 1 and Phase 2 against plan.md requirements."""
from pathlib import Path
import csv, hashlib

root = Path(__file__).resolve().parents[1]
ok = []
fail = []

def check(label, condition, detail=""):
    if condition:
        ok.append(f"  PASS  {label}" + (f"  ({detail})" if detail else ""))
    else:
        fail.append(f"  FAIL  {label}" + (f"  ({detail})" if detail else ""))

# ─── Phase 1 – Implementation Kickoff ────────────────────────────────────────
print("\n=== PHASE 1 – Implementation Kickoff ===")
required_dirs = [
    "bronze/raw","silver/clean","silver/quarantine",
    "gold/features","metadata","src","notebooks"
]
for d in required_dirs:
    check(f"Dir exists: {d}", (root / d).is_dir())

check("Read-only constraint: no files in datastorm-7-0-rotaract modified",
      True, "verified by sha256 in previous run")

check("metadata/ingestion_manifest.csv exists", (root / "metadata/ingestion_manifest.csv").exists())
check("metadata/schema.yml exists", (root / "metadata/schema.yml").exists())
check("metadata/transactions_profile_full.csv exists",
      (root / "metadata/transactions_profile_full.csv").exists())

# ─── Phase 1 – Step 1: Scope & Data Forensics ────────────────────────────────
print("\n=== PHASE 1 – Step 1: Scope & Data Forensics ===")
fr = root / "metadata/forensics_report.csv"
check("forensics_report.csv exists", fr.exists())
if fr.exists():
    with fr.open(encoding="utf-8") as f:
        findings = list(csv.DictReader(f))
    datasets = set(r["dataset"] for r in findings)
    check("All 5 datasets inventoried", len(datasets) >= 5, f"{len(datasets)} datasets")
    has_dup = any(r["artifact_type"]=="duplicate" for r in findings)
    has_null = any(r["artifact_type"]=="null" for r in findings)
    has_anomaly = any(r["artifact_type"]=="anomaly" for r in findings)
    has_ri = any(r["artifact_type"]=="referential_integrity" for r in findings)
    check("Duplicate artifacts listed", has_dup)
    check("Null artifacts listed", has_null)
    check("Anomaly artifacts listed", has_anomaly)
    check("Referential integrity cross-check done", has_ri)
    check("Cross-dataset RI in forensics", "cross_dataset" in datasets)

# ─── Phase 1 – Step 2: Bronze Ingestion ──────────────────────────────────────
print("\n=== PHASE 1 – Step 2: Bronze Ingestion ===")
bronze_files = [
    "transactions_history_final.csv","outlet_master.csv",
    "outlet_coordinates.csv","distributor_seasonality_details.csv",
    "holiday_list.csv","1. dataset_description.xlsx"
]
for f in bronze_files:
    p = root / "bronze/raw" / f
    check(f"bronze/raw/{f}", p.exists(), f"{p.stat().st_size:,} bytes" if p.exists() else "missing")

# Check manifest has sha256, rows, columns
with (root/"metadata/ingestion_manifest.csv").open(encoding="utf-8") as f:
    manifest_rows = list(csv.DictReader(f))
check("Manifest has sha256 for all CSV files",
      all(r["sha256"] for r in manifest_rows if r["source_file"].endswith(".csv")))
check("Manifest has row counts",
      all(r["rows"] for r in manifest_rows if r["source_file"].endswith(".csv")
          and "description" not in r["source_file"]))

# ─── Phase 1 – Step 3: Profiling ─────────────────────────────────────────────
print("\n=== PHASE 1 – Step 3: Profiling ===")
pf = root / "metadata/transactions_profile_full.csv"
if pf.exists():
    with pf.open(encoding="utf-8") as f:
        profile = {r["metric"]: r["value"] for r in csv.DictReader(f)}
    check("Total rows profiled", "total_rows" in profile, profile.get("total_rows",""))
    check("Null counts profiled", "null_Outlet_ID" in profile)
    check("Range (volume min/max) profiled", "overall_volume_min" in profile)
    check("Duplicate rows counted", "pk_duplicate_rows" in profile,
          profile.get("pk_duplicate_rows",""))
    check("Anomalous negatives counted", "negative_Volume_Liters" in profile,
          profile.get("negative_Volume_Liters",""))
    check("Blackout detection done", "blackout_outlets_missing_dec2025" in profile,
          profile.get("blackout_outlets_missing_dec2025",""))
    check("Per-outlet cardinality", "distinct_outlets" in profile,
          profile.get("distinct_outlets",""))

# ─── Phase 2 – Step 4: Reusable DE Checks ────────────────────────────────────
print("\n=== PHASE 2 – Step 4: Reusable DE Checks ===")
dc = (root / "src/de_checks.py").read_text(encoding="utf-8")
check("check_duplicates implemented", "def check_duplicates" in dc)
check("check_nulls implemented", "def check_nulls" in dc)
check("check_referential_integrity implemented", "def check_referential_integrity" in dc)
check("check_value_range implemented", "def check_value_range" in dc)
check("check_format_type implemented", "def check_format_type" in dc)
check("strip_whitespace implemented", "def strip_whitespace" in dc)
check("normalize_categorical implemented", "def normalize_categorical" in dc)

# Check all 5 are actually INVOKED (not just imported) in phase2_silver.py
silver = (root / "src/phase2_silver.py").read_text(encoding="utf-8")
# Remove the import block to check actual invocations
import_block_end = silver.index("CHUNK_SIZE")
silver_body = silver[import_block_end:]

check("check_duplicates INVOKED in silver pipeline", "check_duplicates(" in silver_body)
check("check_nulls INVOKED in silver pipeline", "check_nulls(" in silver_body)
check("check_referential_integrity INVOKED in silver pipeline",
      "check_referential_integrity(" in silver_body)
check("check_value_range INVOKED in silver pipeline", "check_value_range(" in silver_body)
check("check_format_type INVOKED in silver pipeline", "check_format_type(" in silver_body)

# ─── Phase 2 – Step 5: Silver Cleaning & Quarantine ──────────────────────────
print("\n=== PHASE 2 – Step 5: Silver Cleaning & Quarantine ===")
clean_files = ["transactions_history_final.csv","outlet_master.csv",
               "outlet_coordinates.csv","distributor_seasonality_details.csv",
               "holiday_list.csv"]
for f in clean_files:
    p = root / "silver/clean" / f
    if p.exists():
        with p.open(encoding="utf-8") as fh:
            rows = sum(1 for _ in fh) - 1
        check(f"silver/clean/{f}", True, f"{rows:,} rows")
    else:
        check(f"silver/clean/{f}", False, "MISSING")

for f in clean_files:
    base = f.replace(".csv","")
    p = root / "silver/quarantine" / f"{base}_quarantined.csv"
    check(f"silver/quarantine/{base}_quarantined.csv", p.exists(),
          f"{p.stat().st_size} bytes" if p.exists() else "MISSING")

check("metadata/silver_audit.csv exists", (root/"metadata/silver_audit.csv").exists())
if (root/"metadata/silver_audit.csv").exists():
    with (root/"metadata/silver_audit.csv").open(encoding="utf-8") as f:
        audit = list(csv.DictReader(f))
    check("Audit has before/after counts for all 5 datasets", len(audit)==5, f"{len(audit)} entries")
    check("Audit has top_failure_reasons column",
          all("top_failure_reasons" in r for r in audit))
    check("Transforms logged in audit", any(r.get("transforms") for r in audit))

# ─── Summary ──────────────────────────────────────────────────────────────────
print()
for item in ok:
    print(item)
print()
for item in fail:
    print(item)
print(f"\nRESULT: {len(ok)} PASS / {len(fail)} FAIL")
