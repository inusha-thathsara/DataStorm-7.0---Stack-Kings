from __future__ import annotations

import csv
import datetime as dt
import hashlib
import os
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DATASET_DIR = ROOT / "datastorm-7-0-rotaract"
MANIFEST_PATH = ROOT / "metadata" / "ingestion_manifest.csv"

# Only read from the dataset folder; never write into it.
DATASET_FILES = [
    "transactions_history_final.csv",
    "outlet_master.csv",
    "outlet_coordinates.csv",
    "distributor_seasonality_details.csv",
    "holiday_list.csv",
    "1. dataset_description.xlsx",
]


def sha256_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def read_csv_header(path: Path, encoding: str = "utf-8-sig") -> list[str]:
    with path.open("r", encoding=encoding, errors="replace", newline="") as handle:
        reader = csv.reader(handle)
        return next(reader)


def count_lines_fast(path: Path, encoding: str = "utf-8-sig") -> int | None:
    if path.suffix.lower() != ".csv":
        return None
    count = 0
    with path.open("r", encoding=encoding, errors="replace", newline="") as handle:
        for _ in handle:
            count += 1
    return max(count - 1, 0)  # subtract header


def build_manifest(rows: Iterable[dict[str, str]]) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MANIFEST_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["source_file", "ingested_at", "sha256", "rows", "columns", "notes"],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def main() -> None:
    entries: list[dict[str, str]] = []
    ingested_at = dt.datetime.utcnow().isoformat(timespec="seconds") + "Z"

    for filename in DATASET_FILES:
        file_path = DATASET_DIR / filename
        if not file_path.exists():
            entries.append(
                {
                    "source_file": str(file_path),
                    "ingested_at": ingested_at,
                    "sha256": "",
                    "rows": "",
                    "columns": "",
                    "notes": "missing",
                }
            )
            continue

        sha256 = sha256_file(file_path)
        rows = count_lines_fast(file_path)

        columns = ""
        notes = ""
        if file_path.suffix.lower() == ".csv":
            columns = ",".join(read_csv_header(file_path))
        else:
            notes = "non-csv (columns not captured)"

        entries.append(
            {
                "source_file": str(file_path.relative_to(ROOT)),
                "ingested_at": ingested_at,
                "sha256": sha256,
                "rows": "" if rows is None else str(rows),
                "columns": columns,
                "notes": notes,
            }
        )

    build_manifest(entries)
    print(f"Manifest written to {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
