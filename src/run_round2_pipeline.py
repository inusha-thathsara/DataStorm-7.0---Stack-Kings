"""
run_round2_pipeline.py — End-to-end Round 2 pipeline (Workstream 5)
====================================================================
Runs modeling → optimization → submissions → app export → QA audits.

Usage:
  python src/run_round2_pipeline.py              # from gold features onward
  python src/run_round2_pipeline.py --full       # bronze through audits
  python src/run_round2_pipeline.py --skip-audit # pipeline only, no audit_all
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable

FULL_STEPS: list[tuple[str, str]] = [
    ("Bronze ingest", "ingest_manifest.py"),
    ("Phase 1 forensics", "phase1_forensics.py"),
    ("Phase 1 profile", "phase1_profile_enhanced.py"),
    ("Silver clean", "phase2_silver.py"),
    ("POI acquire (Overpass)", "phase3_poi_acquire.py"),
    ("POI synthetic fallback", "phase3_poi_synthetic.py"),
    ("Gold features", "phase3_gold_features.py"),
]

ROUND2_STEPS: list[tuple[str, str]] = [
    ("Gold features (decay + competition)", "phase3_gold_features.py"),
    ("Aggregate outlet stats", "phase4_aggregate.py"),
    ("K-Means ceilings", "phase4_model.py"),
    ("Quantile regression", "phase4_quantile.py"),
    ("Ensemble predict", "phase4_predict.py"),
    ("Validate predictions", "phase4_validate.py"),
    ("LKR 5M optimizer", "phase4_optimize.py"),
    ("Submission CSVs", "phase5_submit.py"),
    ("Export app data", "phase6_export_app_data.py"),
]

QA_STEPS: list[tuple[str, str]] = [
    ("XAI template validation", "validate_xai_samples.py"),
    ("XAI live LLM validation (optional)", "validate_xai_llm.py"),
    ("Master audit", "audit_all.py"),
]


def run_step(label: str, script: str) -> None:
    path = ROOT / "src" / script
    if not path.exists():
        print(f"  ERROR: missing {path}")
        sys.exit(1)
    print(f"\n{'=' * 60}\n>>> {label}\n    python src/{script}\n{'=' * 60}")
    result = subprocess.run([PYTHON, str(path)], cwd=str(ROOT))
    if result.returncode != 0:
        print(f"\n  FAILED: {script} (exit {result.returncode})")
        sys.exit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Round 2 pipeline end-to-end")
    parser.add_argument(
        "--full",
        action="store_true",
        help="Run bronze→gold before Round 2 modeling (includes POI acquire + synthetic)",
    )
    parser.add_argument(
        "--skip-audit",
        action="store_true",
        help="Skip validate_xai_samples.py and audit_all.py",
    )
    args = parser.parse_args()

    print("=== Stack Kings — Round 2 Pipeline (Workstream 5) ===\n")
    print(f"  Root: {ROOT}")
    print(f"  Python: {PYTHON}\n")

    steps: list[tuple[str, str]] = []
    if args.full:
        steps.extend(FULL_STEPS)
    else:
        steps.extend(ROUND2_STEPS)

    if not args.skip_audit:
        steps.extend(QA_STEPS)

    for label, script in steps:
        run_step(label, script)

    print("\n" + "=" * 60)
    print("Pipeline complete.")
    print("  submissions/StackKings_predictions.csv")
    print("  submissions/StackKings_budget_allocations.csv")
    print("  app/public/data/outlets.json")
    if not args.skip_audit:
        print("  Review audit_all.py output above (target: 0 FAIL)")
    print("  App: cd app && npm run dev  →  http://localhost:3000")
    print("=" * 60)


if __name__ == "__main__":
    main()
