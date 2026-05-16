"""
phase3_poi_synthetic.py — Realistic Synthetic POI Generator (Fallback)
=======================================================================
Purpose
-------
When the Overpass API is unreachable (network restrictions in some
environments), this script generates geographically realistic synthetic
POI data for Sri Lanka using province population centres as cluster
seeds. Outputs are in the same format as phase3_poi_acquire.py so the
entire downstream Gold pipeline remains unchanged.

Methodology
-----------
- Six major population centres across the 4 target provinces are used as
  cluster seeds (weighted by provincial population share).
- Each POI category has a realistic count sourced from OSM statistics
  for Sri Lanka (see references in report):
    education : ~9 000   schools, colleges, universities
    health    : ~2 500   hospitals, clinics, pharmacies
    transport : ~7 000   bus stops and stations
    market    : ~2 000   supermarkets, convenience stores, markets
    tourism   : ~1 000   hotels, attractions, museums
    food      : ~4 500   restaurants, cafes, fast food
    worship   : ~18 000  temples, churches, mosques (very high in LK)
- Each POI is placed using a mixture of Gaussians around the cluster
  centres (σ ≈ 0.35°) plus 20 % uniform coverage across the island.
- Coordinates are clipped to Sri Lanka bounds.

This approach is documented as synthetic in the competition notebook.
The pipeline code (phase3_poi_acquire.py) correctly targets Overpass
and is the production solution; this script is the CI/offline fallback.

Reference counts (approximate) from OpenStreetMap Sri Lanka (2024):
  schools + colleges : ~8 500
  health facilities  : ~2 800
  bus stops          : ~6 200
  markets/shops      : ~2 100
  tourism nodes      : ~950
  food service       : ~4 300
  places of worship  : ~17 500
"""
from __future__ import annotations

import csv
import datetime as dt
import random
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
GOLD_FEATURES = ROOT / "gold" / "features"
GOLD_FEATURES.mkdir(parents=True, exist_ok=True)

POI_NORM_PATH = GOLD_FEATURES / "poi_normalized.csv"
POI_RAW_DIR = GOLD_FEATURES / "poi_raw"
POI_RAW_DIR.mkdir(parents=True, exist_ok=True)

# Sri Lanka valid bounds
LAT_MIN, LAT_MAX = 5.85, 9.90
LON_MIN, LON_MAX = 79.65, 81.90

# Population-weighted cluster centres (lat, lon, weight)
# Western (Colombo, Gampaha) · Central (Kandy) · N-W (Kurunegala, Puttalam) · Southern (Galle)
CLUSTERS = [
    (6.93, 79.85, 0.28),   # Colombo metro
    (7.09, 80.01, 0.18),   # Gampaha / Ja-Ela
    (6.59, 79.97, 0.09),   # Kalutara
    (7.29, 80.64, 0.16),   # Kandy
    (7.49, 80.36, 0.12),   # Kurunegala
    (8.04, 79.84, 0.05),   # Puttalam
    (6.03, 80.22, 0.08),   # Galle
    (5.96, 80.53, 0.04),   # Matara
]
CLUSTER_SIGMA = 0.35   # degrees — approx 35–40 km spread
UNIFORM_FRAC  = 0.20   # 20 % of POIs drawn from uniform distribution

# (canonical_category, synthetic_count)
CATEGORY_COUNTS: list[tuple[str, int]] = [
    ("education",  9_000),
    ("health",     2_500),
    ("transport",  7_000),
    ("market",     2_000),
    ("tourism",    1_000),
    ("food",       4_500),
    ("worship",   18_000),
]

FIELDNAMES = [
    "poi_id", "canonical_category", "osm_type", "osm_id",
    "lat", "lon", "name", "amenity", "shop", "tourism",
    "highway", "public_transport", "generated_at",
]

# Plausible amenity tags per category (for realism in the CSV)
CATEGORY_TAGS: dict[str, list[str]] = {
    "education": ["school", "college", "university", "kindergarten"],
    "health":    ["hospital", "clinic", "pharmacy", "doctors"],
    "transport": ["bus_stop", "bus_stop", "bus_stop", "bus_station"],
    "market":    ["marketplace", "supermarket", "convenience"],
    "tourism":   ["hotel", "attraction", "museum", "guesthouse", "viewpoint"],
    "food":      ["restaurant", "fast_food", "cafe", "bar"],
    "worship":   ["place_of_worship"],
}


def sample_poi_coords(n: int, rng: np.random.Generator) -> np.ndarray:
    """
    Sample n (lat, lon) pairs using mixture of Gaussians + uniform.
    Returns array of shape (n, 2).
    """
    n_cluster = int(n * (1 - UNIFORM_FRAC))
    n_uniform = n - n_cluster

    # Sample cluster centre indices weighted by population share
    weights = np.array([c[2] for c in CLUSTERS])
    weights /= weights.sum()
    centres_idx = rng.choice(len(CLUSTERS), size=n_cluster, p=weights)

    pts_cluster = np.array([
        [
            CLUSTERS[i][0] + rng.normal(0, CLUSTER_SIGMA),
            CLUSTERS[i][1] + rng.normal(0, CLUSTER_SIGMA),
        ]
        for i in centres_idx
    ])

    pts_uniform = np.column_stack([
        rng.uniform(LAT_MIN, LAT_MAX, n_uniform),
        rng.uniform(LON_MIN, LON_MAX, n_uniform),
    ])

    pts = np.vstack([pts_cluster, pts_uniform])

    # Clip to Sri Lanka bounds
    pts[:, 0] = np.clip(pts[:, 0], LAT_MIN, LAT_MAX)
    pts[:, 1] = np.clip(pts[:, 1], LON_MIN, LON_MAX)

    return pts


def main() -> None:
    generated_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    rng = np.random.default_rng(seed=42)  # reproducible

    print("=== Phase 3 – Synthetic POI Generator (Overpass Fallback) ===\n")

    all_records: list[dict] = []
    poi_counter = 0

    for canonical, count in CATEGORY_COUNTS:
        coords = sample_poi_coords(count, rng)
        tags = CATEGORY_TAGS.get(canonical, ["unknown"])

        for i, (lat, lon) in enumerate(coords):
            tag = tags[i % len(tags)]
            poi_counter += 1

            # Determine tag placement (amenity vs highway vs tourism etc.)
            if canonical == "transport" and tag == "bus_stop":
                amenity_val, highway_val, tourism_val = "", "bus_stop", ""
            elif canonical == "tourism":
                amenity_val, highway_val, tourism_val = "", "", tag
            else:
                amenity_val, highway_val, tourism_val = tag, "", ""

            all_records.append({
                "poi_id": f"synth_{poi_counter}",
                "canonical_category": canonical,
                "osm_type": "node",
                "osm_id": poi_counter,
                "lat": round(float(lat), 6),
                "lon": round(float(lon), 6),
                "name": "",
                "amenity": amenity_val,
                "shop": "supermarket" if canonical == "market" and tag == "supermarket" else "",
                "tourism": tourism_val,
                "highway": highway_val,
                "public_transport": "",
                "generated_at": generated_at,
            })

        print(f"  {canonical:<15}: {count:>6,} POIs generated")

    # Write normalised CSV
    with POI_NORM_PATH.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_records)

    print(f"\nTotal synthetic POIs: {len(all_records):,}")
    print(f"Saved to: {POI_NORM_PATH}")
    print("\nNOTE: This is synthetic data based on OSM Sri Lanka statistics.")
    print("      Run phase3_poi_acquire.py to replace with real Overpass data.")


if __name__ == "__main__":
    main()
