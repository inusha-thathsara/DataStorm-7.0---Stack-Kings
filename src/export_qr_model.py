"""
export_qr_model.py — Fit and save QR coefficients only (for XAI drivers)
=======================================================================
Run if metadata/qr_model.json is missing without re-running full quantile outputs:

  python src/export_qr_model.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Re-use phase4_quantile main fit path
if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root / "src"))
    from phase4_quantile import main

    print("=== Export QR Model (via phase4_quantile) ===\n")
    main()
