from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = ROOT / "datastorm-7-0-rotaract"
BRONZE_RAW = ROOT / "bronze" / "raw"

FILES = [
    "transactions_history_final.csv",
    "outlet_master.csv",
    "outlet_coordinates.csv",
    "distributor_seasonality_details.csv",
    "holiday_list.csv",
    "1. dataset_description.xlsx",
]


def main() -> None:
    BRONZE_RAW.mkdir(parents=True, exist_ok=True)
    for filename in FILES:
        source = DATASET_DIR / filename
        if not source.exists():
            print(f"Missing source file: {source}")
            continue
        destination = BRONZE_RAW / filename
        shutil.copy2(source, destination)
        print(f"Copied {source} -> {destination}")


if __name__ == "__main__":
    main()
