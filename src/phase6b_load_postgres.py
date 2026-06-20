"""
phase6b_load_postgres.py — Load phase6 JSON export into Neon Postgres
======================================================================
Requires DATABASE_URL (Neon connection string). Skips gracefully if unset.

Usage:
  python src/phase6b_load_postgres.py

Run after phase6_export_app_data.py (reads app/public/data/outlets.json).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from env_local import load_env_local

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app" / "public" / "data"
OUTLETS_PATH = APP_DATA / "outlets.json"
SUMMARY_PATH = APP_DATA / "optimization_summary.json"
MANIFEST_PATH = APP_DATA / "export_manifest.json"

def outlet_to_row(o: dict) -> dict:
    drivers = o.get("modelDrivers")
    return {
        "id": o["id"],
        "predicted_liters": o.get("predictedLiters", 0),
        "own_max_vol": o.get("ownMaxVol", 0),
        "gap_liters": o.get("gapLiters", 0),
        "recent_3m_avg": o.get("recent3mAvg", 0),
        "province": o.get("province", ""),
        "distributor_id": o.get("distributorId", ""),
        "competitor_density": o.get("competitorDensity", 0),
        "competitor_density_z": o.get("competitorDensityZ", 0),
        "market_saturation": o.get("marketSaturation", ""),
        "dbscan_zone": o.get("dbscanZone", -1),
        "dbscan_is_core": bool(o.get("dbscanIsCore", False)),
        "cluster_id": o.get("clusterId", ""),
        "cluster_ceiling": o.get("clusterCeiling", 0),
        "kmeans_ceiling": o.get("kmeansCeiling", 0),
        "qr_ceiling": o.get("qrCeiling", 0),
        "base_ensemble": o.get("baseEnsemble", 0),
        "adjusted_ceiling": o.get("adjustedCeiling", 0),
        "jan_factor": o.get("janFactor", 1),
        "seasonality_label": o.get("seasonalityLabel", ""),
        "cooler_count": o.get("coolerCount", 0),
        "outlet_size": o.get("outletSize", ""),
        "outlet_type": o.get("outletType", ""),
        "lat": o.get("lat", 0),
        "lon": o.get("lon", 0),
        "decay_transport": o.get("decayTransport", 0),
        "decay_food": o.get("decayFood", 0),
        "decay_worship": o.get("decayWorship", 0),
        "decay_total": o.get("decayTotal", 0),
        "trade_spend_lkr": o.get("tradeSpendLkr", 0),
        "predicted_incremental_liters": o.get("predictedIncrementalLiters", 0),
        "dominant_method": o.get("dominantMethod", ""),
        "adjustment_factor": o.get("adjustmentFactor", 1),
        "model_drivers": json.dumps(drivers) if drivers else None,
    }


def outlet_to_copy_row(o: dict) -> tuple:
    r = outlet_to_row(o)
    return (
        r["id"],
        r["predicted_liters"],
        r["own_max_vol"],
        r["gap_liters"],
        r["recent_3m_avg"],
        r["province"],
        r["distributor_id"],
        r["competitor_density"],
        r["competitor_density_z"],
        r["market_saturation"],
        r["dbscan_zone"],
        r["dbscan_is_core"],
        r["cluster_id"],
        r["cluster_ceiling"],
        r["kmeans_ceiling"],
        r["qr_ceiling"],
        r["base_ensemble"],
        r["adjusted_ceiling"],
        r["jan_factor"],
        r["seasonality_label"],
        r["cooler_count"],
        r["outlet_size"],
        r["outlet_type"],
        r["lat"],
        r["lon"],
        r["decay_transport"],
        r["decay_food"],
        r["decay_worship"],
        r["decay_total"],
        r["trade_spend_lkr"],
        r["predicted_incremental_liters"],
        r["dominant_method"],
        r["adjustment_factor"],
        r["model_drivers"],
    )


COPY_OUTLETS = """
COPY outlets (
  id, predicted_liters, own_max_vol, gap_liters, recent_3m_avg,
  province, distributor_id, competitor_density, competitor_density_z,
  market_saturation, dbscan_zone, dbscan_is_core, cluster_id,
  cluster_ceiling, kmeans_ceiling, qr_ceiling, base_ensemble,
  adjusted_ceiling, jan_factor, seasonality_label, cooler_count,
  outlet_size, outlet_type, lat, lon, decay_transport, decay_food,
  decay_worship, decay_total, trade_spend_lkr, predicted_incremental_liters,
  dominant_method, adjustment_factor, model_drivers
) FROM STDIN
"""


def main() -> None:
    print("=== Phase 6b - Load Postgres ===\n")
    load_env_local()
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("  SKIP: DATABASE_URL not set — Postgres load optional.")
        print("  Set DATABASE_URL to your Neon connection string and re-run.")
        return
    if "__NEON_PASSWORD__" in database_url:
        print("  ERROR: Replace __NEON_PASSWORD__ in app/.env.local with your Neon password")
        sys.exit(1)

    if not OUTLETS_PATH.exists():
        print(f"  ERROR: {OUTLETS_PATH} missing — run phase6_export_app_data.py first")
        sys.exit(1)

    try:
        import psycopg
    except ModuleNotFoundError:
        print("  ERROR: pip install 'psycopg[binary]' (see requirements.txt)")
        sys.exit(1)

    with OUTLETS_PATH.open(encoding="utf-8") as fh:
        payload = json.load(fh)
    outlets = payload.get("outlets", [])
    if not outlets:
        print("  ERROR: outlets.json has no outlets")
        sys.exit(1)

    manifest = {}
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    generated_at = manifest.get("generatedAt") or datetime.now(timezone.utc).isoformat()
    sha_prefix = manifest.get("predictions_sha256_prefix", "")

    summary_rows: list[tuple[str, str]] = []
    if SUMMARY_PATH.exists():
        summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
        summary_rows = [(k, str(v)) for k, v in summary.items()]

    # Bulk load uses direct host + COPY (much faster than row-by-row INSERT).
    load_url = database_url.replace("-pooler.", ".")
    total = len(outlets)

    with psycopg.connect(load_url, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE outlets")
            with cur.copy(COPY_OUTLETS) as copy:
                for o in outlets:
                    copy.write_row(outlet_to_copy_row(o))
            print(f"  COPY {total:,} outlets")

            cur.execute("DELETE FROM optimization_summary")
            if summary_rows:
                cur.executemany(
                    "INSERT INTO optimization_summary (metric, value) VALUES (%s, %s)",
                    summary_rows,
                )

            cur.execute(
                """
                INSERT INTO export_runs (generated_at, predictions_sha256_prefix, audit_passed, row_count)
                VALUES (%s, %s, %s, %s)
                """,
                (generated_at, sha_prefix, False, total),
            )
        conn.commit()

    print(f"  Loaded {len(outlets):,} outlets into Postgres")
    print(f"  optimization_summary: {len(summary_rows)} metrics")
    print(f"  export_runs recorded at {generated_at}")
    print("\nPhase 6b Postgres load complete.")


if __name__ == "__main__":
    main()
