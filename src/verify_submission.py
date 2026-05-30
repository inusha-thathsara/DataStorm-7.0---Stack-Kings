"""Quick submission + app data verification (run before submit)."""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    errors: list[str] = []

    pred_path = ROOT / "submissions" / "StackKings_predictions.csv"
    with pred_path.open(encoding="utf-8", newline="") as f:
        pred_rows = list(csv.DictReader(f))
    if len(pred_rows) != 20_000:
        errors.append(f"predictions rows={len(pred_rows)} expected 20000")
    for col in ("Outlet_ID", "Maximum_Monthly_Liters"):
        if col not in pred_rows[0]:
            errors.append(f"predictions missing column {col}")

    bud_path = ROOT / "submissions" / "StackKings_budget_allocations.csv"
    with bud_path.open(encoding="utf-8", newline="") as f:
        bud_rows = list(csv.DictReader(f))
    if len(bud_rows) != 9_000:
        errors.append(f"budget rows={len(bud_rows)} expected 9000")
    spend_col = next(
        (c for c in bud_rows[0] if c != "Outlet_ID"),
        None,
    )
    if not spend_col:
        errors.append("budget missing spend column")
    else:
        total = sum(float(r[spend_col].replace(",", "")) for r in bud_rows)
        if abs(total - 5_000_000) > 1:
            errors.append(f"budget total={total} expected 5000000")

    outlets_path = ROOT / "app" / "public" / "data" / "outlets.json"
    if not outlets_path.exists():
        errors.append("outlets.json missing")
    else:
        payload = json.loads(outlets_path.read_text(encoding="utf-8"))
        outlets = payload.get("outlets", payload)
        if len(outlets) != 20_000:
            errors.append(f"outlets.json count={len(outlets)}")

    manifest_path = ROOT / "app" / "public" / "data" / "export_manifest.json"
    if not manifest_path.exists():
        errors.append("export_manifest.json missing")
    else:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("schemaVersion") != 2:
            errors.append(f"manifest schemaVersion={manifest.get('schemaVersion')}")
        if not manifest.get("xaiIncludesFeatureWeights"):
            errors.append("manifest xaiIncludesFeatureWeights not true")

    if errors:
        print("FAIL:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    print("PASS: submissions + app export data")
    print(f"  predictions: {len(pred_rows):,} rows")
    print(f"  budget: {len(bud_rows):,} rows, LKR {total:,.2f} total")
    print(f"  outlets.json: {len(outlets):,} outlets, schema v2 manifest OK")


if __name__ == "__main__":
    main()
