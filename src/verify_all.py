"""
verify_all.py — one-command pre-submit verification (Python pipeline + data).
Run app checks separately: cd app && npm run build:clean
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"


def run(label: str, script: str) -> None:
    print(f"\n{'=' * 60}\n{label}\n{'=' * 60}")
    r = subprocess.run([sys.executable, str(SRC / script)], cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def main() -> None:
    run("Audit all (327 checks)", "audit_all.py")
    run("Phase 4 validation", "phase4_validate.py")
    run("XAI sample validation", "validate_xai_samples.py")
    run("Submission + app export data", "verify_submission.py")
    print("\n" + "=" * 60)
    print("Python verification: ALL PASS")
    print("Next: cd app && npm run build:clean && npm run start")
    print("=" * 60)


if __name__ == "__main__":
    main()
