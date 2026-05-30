"""
summarize_decay_beta.py — β calibration table + sensitivity vs legacy counts.
Writes metadata/decay_beta_sensitivity.csv (numbers cited in technical paper §1.5).
"""
from __future__ import annotations

import csv
import math
import sys
from pathlib import Path

from spatial_decay import MAX_SEARCH_KM


def spearman_rho(x: list[float], y: list[float]) -> float:
    """Rank correlation without scipy (stdlib only)."""
    n = len(x)
    if n < 2:
        return float("nan")

    def ranks(vals: list[float]) -> list[float]:
        order = sorted(range(n), key=lambda i: vals[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg_rank = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                r[order[k]] = avg_rank
            i = j + 1
        return r

    rx, ry = ranks(x), ranks(y)
    mx = sum(rx) / n
    my = sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    den_x = sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
    den_y = sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    if den_x == 0 or den_y == 0:
        return float("nan")
    return num / (den_x * den_y)

ROOT = Path(__file__).resolve().parents[1]
COMPARE = ROOT / "metadata" / "spatial_feature_comparison.csv"
OUT = ROOT / "metadata" / "decay_beta_sensitivity.csv"

CATEGORIES = [
    ("education", 1.5),
    ("worship", 1.5),
    ("health", 2.0),
    ("market", 2.0),
    ("tourism", 2.0),
    ("transport", 3.0),
    ("food", 3.0),
]

DISTANCES_KM = [0.25, 0.5, 1.0, 2.0, 3.0, 5.0]


def main() -> None:
    rows_out: list[dict] = []

    for cat, beta in CATEGORIES:
        half_km = math.log(2) / beta
        rows_out.append({
            "section": "production_beta",
            "category": cat,
            "beta_per_km": beta,
            "half_distance_km": round(half_km, 4),
            "half_distance_m": round(half_km * 1000, 1),
            "max_search_km": MAX_SEARCH_KM,
        })

    for beta in (1.5, 2.0, 3.0):
        for d in DISTANCES_KM:
            rows_out.append({
                "section": "single_poi_weight",
                "beta_per_km": beta,
                "distance_km": d,
                "weight": round(math.exp(-beta * d), 6),
            })

    if not COMPARE.exists():
        print(f"Missing {COMPARE}; run phase3_gold_features.py first.", file=sys.stderr)
        sys.exit(1)

    with COMPARE.open(encoding="utf-8", newline="") as fh:
        data = list(csv.DictReader(fh))

    for cat, beta in CATEGORIES:
        leg = f"legacy_{cat}_3km"
        dec = f"decay_{cat}"
        a = [float(r.get(leg, 0) or 0) for r in data]
        b = [float(r.get(dec, 0) or 0) for r in data]
        rho = spearman_rho(a, b)
        rows_out.append({
            "section": "ab_spearman",
            "category": cat,
            "beta_per_km": beta,
            "legacy_feature": leg,
            "decay_feature": dec,
            "spearman_rho": round(float(rho), 4),
            "n_outlets": len(data),
        })

    dt = sorted(float(r.get("decay_total", 0) or 0) for r in data)
    for p in (10, 50, 90):
        k = (len(dt) - 1) * p / 100
        lo, hi = int(k), min(int(k) + 1, len(dt) - 1)
        val = dt[lo] + (k - lo) * (dt[hi] - dt[lo])
        rows_out.append({
            "section": "decay_total_percentile",
            "percentile": p,
            "decay_total": round(val, 4),
            "n_outlets": len(data),
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    fieldnames: list[str] = []
    for r in rows_out:
        for k in r:
            if k not in fieldnames:
                fieldnames.append(k)
    with OUT.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows_out)

    print(f"Wrote {OUT} ({len(rows_out)} rows)")
    print("\nSpearman (legacy 3km vs decay):")
    for r in rows_out:
        if r.get("section") == "ab_spearman":
            print(f"  {r['category']:12} beta={r['beta_per_km']}  rho={r['spearman_rho']}")


if __name__ == "__main__":
    main()
