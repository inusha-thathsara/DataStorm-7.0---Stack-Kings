"""
phase3_poi_acquire.py — POI Acquisition from OpenStreetMap (Overpass API)
=========================================================================
Phase 3 / Step 6:
  - Queries the Overpass API (OpenStreetMap) for Points of Interest across
    the four relevant Sri Lanka provinces (single bounding-box strategy to
    avoid per-outlet API calls and IP rate-limit bans).
  - Saves raw JSON snapshots → gold/features/poi_raw/<category>.json
  - Normalises into a single flat CSV → gold/features/poi_normalized.csv

Category groups queried
-----------------------
  education  : school, college, university, kindergarten
  health     : hospital, clinic, pharmacy, doctors
  transport  : bus_station, bus_stop
  market     : marketplace, supermarket, convenience, grocery
  tourism    : attraction, hotel, guesthouse, museum, viewpoint
  food       : restaurant, fast_food, cafe, bar
  worship    : place_of_worship

Design
------
  - Results are cached on disk; re-running skips completed categories.
  - Adds a 3-second delay between category requests (rate-limit courtesy).
  - Falls back gracefully if Overpass is unreachable.
"""
from __future__ import annotations

import csv
import json
import time
import datetime as dt
from pathlib import Path

try:
    import requests
except ModuleNotFoundError:
    import sys
    print(
        "ERROR: Missing package 'requests'.\n"
        "  Option A (recommended): activate the project venv, then re-run:\n"
        "    .venv\\Scripts\\activate          # Windows\n"
        "    pip install -r requirements.txt\n"
        "    python src/phase3_poi_acquire.py\n"
        "  Option B: install into current Python:\n"
        "    python -m pip install -r requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parents[1]
POI_RAW_DIR = ROOT / "gold" / "features" / "poi_raw"
POI_NORM_PATH = ROOT / "gold" / "features" / "poi_normalized.csv"

# Sri Lanka bounding box covering all 4 provinces (S, W, N, E)
SL_BBOX = (5.90, 79.60, 9.90, 81.90)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
REQUEST_TIMEOUT = 180  # seconds
DELAY_BETWEEN_REQUESTS = 4  # seconds

# ── Category definitions ──────────────────────────────────────────────────────
# Each entry: (canonical_name, overpass_filter_lines)
CATEGORIES: list[tuple[str, str]] = [
    (
        "education",
        """
  node["amenity"~"^(school|college|university|kindergarten|language_school)$"]{bbox};
  way["amenity"~"^(school|college|university|kindergarten)$"]{bbox};
""",
    ),
    (
        "health",
        """
  node["amenity"~"^(hospital|clinic|pharmacy|doctors|dentist|health_post)$"]{bbox};
  way["amenity"~"^(hospital|clinic)$"]{bbox};
""",
    ),
    (
        "transport",
        """
  node["amenity"="bus_station"]{bbox};
  node["highway"="bus_stop"]{bbox};
  node["public_transport"="stop_position"]{bbox};
""",
    ),
    (
        "market",
        """
  node["amenity"="marketplace"]{bbox};
  node["shop"~"^(supermarket|convenience|grocery|department_store|mall)$"]{bbox};
  way["shop"~"^(supermarket|convenience|grocery)$"]{bbox};
""",
    ),
    (
        "tourism",
        """
  node["tourism"~"^(attraction|hotel|guesthouse|museum|viewpoint|resort|chalet)$"]{bbox};
  way["tourism"~"^(attraction|hotel|museum)$"]{bbox};
""",
    ),
    (
        "food",
        """
  node["amenity"~"^(restaurant|fast_food|cafe|bar|food_court|juice_bar|ice_cream)$"]{bbox};
""",
    ),
    (
        "worship",
        """
  node["amenity"="place_of_worship"]{bbox};
  way["amenity"="place_of_worship"]{bbox};
""",
    ),
]


def build_query(filter_lines: str) -> str:
    """Build Overpass QL query with the Sri Lanka bounding box substituted."""
    bbox_str = f"{SL_BBOX[0]},{SL_BBOX[1]},{SL_BBOX[2]},{SL_BBOX[3]}"
    filters = filter_lines.replace("{bbox}", f"({bbox_str})")
    return f"[out:json][timeout:{REQUEST_TIMEOUT}];\n(\n{filters}\n);\nout center;"


def fetch_overpass(query: str, category: str) -> dict | None:
    """Execute an Overpass query and return the parsed JSON or None on failure."""
    print(f"    Querying Overpass API for: {category} ...")
    try:
        resp = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=REQUEST_TIMEOUT + 30,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.Timeout:
        print(f"    ERROR: Request timed out for {category}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"    ERROR: {e}")
        return None


def extract_elements(data: dict, canonical: str) -> list[dict]:
    """
    Parse Overpass JSON response into flat POI records.
    Handles both node (direct lat/lon) and way/relation (center lat/lon).
    """
    records = []
    for elem in data.get("elements", []):
        lat = elem.get("lat") or (elem.get("center") or {}).get("lat")
        lon = elem.get("lon") or (elem.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        tags = elem.get("tags", {})
        records.append(
            {
                "poi_id": f"{elem['type']}_{elem['id']}",
                "canonical_category": canonical,
                "osm_type": elem["type"],
                "osm_id": elem["id"],
                "lat": lat,
                "lon": lon,
                "name": tags.get("name", ""),
                "amenity": tags.get("amenity", ""),
                "shop": tags.get("shop", ""),
                "tourism": tags.get("tourism", ""),
                "highway": tags.get("highway", ""),
                "public_transport": tags.get("public_transport", ""),
            }
        )
    return records


def main() -> None:
    POI_RAW_DIR.mkdir(parents=True, exist_ok=True)
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    all_records: list[dict] = []

    print("=== Phase 3 - POI Acquisition (OpenStreetMap / Overpass) ===\n")
    print(f"  Bounding box: {SL_BBOX}")
    print(f"  Categories  : {len(CATEGORIES)}\n")

    for i, (canonical, filter_lines) in enumerate(CATEGORIES, 1):
        raw_path = POI_RAW_DIR / f"{canonical}.json"

        # ── Cache hit: skip if already downloaded ────────────────────────────
        if raw_path.exists():
            print(f"  [{i}/{len(CATEGORIES)}] {canonical}: cache hit -> {raw_path.name}")
            with raw_path.open(encoding="utf-8") as fh:
                data = json.load(fh)
        else:
            # ── Fetch from Overpass ───────────────────────────────────────────
            query = build_query(filter_lines)
            print(f"  [{i}/{len(CATEGORIES)}] {canonical}:")
            data = fetch_overpass(query, canonical)

            if data is None:
                print(f"    Skipping {canonical} - no data received.")
                # Write empty placeholder so we don't retry indefinitely
                with raw_path.open("w", encoding="utf-8") as fh:
                    json.dump({"elements": [], "error": "fetch_failed"}, fh)
                continue

            # ── Save raw snapshot ─────────────────────────────────────────────
            with raw_path.open("w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False)

            time.sleep(DELAY_BETWEEN_REQUESTS)

        records = extract_elements(data, canonical)
        all_records.extend(records)
        print(f"    {len(records):,} POIs extracted -> {raw_path.name}")

    # ── Write normalised CSV ──────────────────────────────────────────────────
    fieldnames = [
        "poi_id", "canonical_category", "osm_type", "osm_id",
        "lat", "lon", "name", "amenity", "shop", "tourism",
        "highway", "public_transport", "generated_at",
    ]
    with POI_NORM_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for rec in all_records:
            rec["generated_at"] = generated_at
            writer.writerow(rec)

    # ── Summary ───────────────────────────────────────────────────────────────
    from collections import Counter
    cat_counts = Counter(r["canonical_category"] for r in all_records)
    print(f"\nTotal POIs fetched: {len(all_records):,}")
    print("\nBreakdown by category:")
    for cat, cnt in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat:<15}: {cnt:>6,}")
    print(f"\nNormalised POI CSV -> {POI_NORM_PATH}")


if __name__ == "__main__":
    main()
