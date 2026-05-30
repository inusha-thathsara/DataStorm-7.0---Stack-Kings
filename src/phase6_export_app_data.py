"""
phase6_export_app_data.py — Export pipeline outputs for Next.js app
===================================================================
Writes compact JSON bundles to app/public/data/ for offline demo.
"""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from xai_feature_drivers import build_model_drivers, compute_norm_density_map, load_qr_model
PRED_PATH = ROOT / "gold" / "predictions" / "predictions_final.csv"
FEAT_PATH = ROOT / "gold" / "features" / "outlet_features.csv"
STATS_PATH = ROOT / "gold" / "features" / "outlet_stats.csv"
BUDGET_PATH = ROOT / "gold" / "predictions" / "budget_allocations_raw.csv"
OPT_REPORT = ROOT / "metadata" / "optimization_report.csv"
APP_DATA = ROOT / "app" / "public" / "data"

# Must match app/lib/types.ts Outlet (Workstream 5 schema contract)
OUTLET_EXPORT_FIELDS = (
    "id", "predictedLiters", "ownMaxVol", "gapLiters", "recent3mAvg",
    "province", "distributorId", "competitorDensity", "competitorDensityZ",
    "marketSaturation", "dbscanZone", "dbscanIsCore", "clusterId",
    "clusterCeiling", "kmeansCeiling", "qrCeiling", "baseEnsemble",
    "adjustedCeiling", "janFactor", "seasonalityLabel", "coolerCount",
    "outletSize", "outletType", "lat", "lon", "decayTransport", "decayFood",
    "decayWorship", "decayTotal", "tradeSpendLkr", "predictedIncrementalLiters",
    "dominantMethod", "adjustmentFactor", "modelDrivers",
)


def _file_meta(path: Path) -> dict:
    if not path.exists():
        return {"path": str(path.relative_to(ROOT)), "exists": False}
    st = path.stat()
    return {
        "path": str(path.relative_to(ROOT)),
        "exists": True,
        "mtime_iso": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        "size_bytes": st.st_size,
    }


def read_csv_dict(path: Path) -> dict[str, dict]:
    with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        return {r["Outlet_ID"].strip(): r for r in csv.DictReader(fh)}


def main() -> None:
    print("=== Phase 6 - Export App Data ===\n")
    APP_DATA.mkdir(parents=True, exist_ok=True)

    if not PRED_PATH.exists():
        print(f"  ERROR: {PRED_PATH} missing")
        sys.exit(1)

    preds = read_csv_dict(PRED_PATH)
    feats = read_csv_dict(FEAT_PATH) if FEAT_PATH.exists() else {}
    stats = read_csv_dict(STATS_PATH) if STATS_PATH.exists() else {}
    budget = read_csv_dict(BUDGET_PATH) if BUDGET_PATH.exists() else {}

    qr_model = load_qr_model()
    if qr_model is None:
        print("  WARNING: metadata/qr_model.json missing — run phase4_quantile.py for QR weights in XAI")
    norm_density_map = compute_norm_density_map(feats) if feats else {}

    outlets = []
    for oid in sorted(preds.keys()):
        p, f, s = preds[oid], feats.get(oid, {}), stats.get(oid, {})
        b = budget.get(oid, {})
        outlets.append({
            "id": oid,
            "predictedLiters": float(p.get("Maximum_Monthly_Liters", 0)),
            "ownMaxVol": float(p.get("own_max_vol", s.get("max_monthly_vol", 0) or 0)),
            "gapLiters": float(p.get("gap_liters", 0)),
            "recent3mAvg": float(s.get("recent_3m_avg", 0) or 0),
            "province": p.get("province", f.get("province", "")),
            "distributorId": p.get("distributor_id", f.get("distributor_id", "")),
            "competitorDensity": float(p.get("competitor_density_index", 0) or 0),
            "competitorDensityZ": float(p.get("competitor_density_z", 0) or 0),
            "marketSaturation": p.get("market_saturation_label", f.get("market_saturation_label", "")),
            "dbscanZone": int(f.get("dbscan_zone_id", -1) or -1),
            "dbscanIsCore": int(f.get("dbscan_is_core", 0) or 0) == 1,
            "clusterId": p.get("cluster_id", ""),
            "clusterCeiling": float(p.get("cluster_ceiling", 0) or 0),
            "kmeansCeiling": float(p.get("kmeans_ceiling", 0) or 0),
            "qrCeiling": float(p.get("qr_ceiling", 0) or 0),
            "baseEnsemble": float(p.get("base_ensemble", 0) or 0),
            "adjustedCeiling": float(p.get("adjusted_ceiling", 0) or 0),
            "janFactor": float(p.get("jan_factor", 1) or 1),
            "seasonalityLabel": f.get("seasonality_jan2026_label", "Moderate"),
            "coolerCount": int(f.get("cooler_count", 0) or 0),
            "outletSize": f.get("outlet_size", ""),
            "outletType": f.get("outlet_type", ""),
            "lat": float(f.get("lat", 0) or 0),
            "lon": float(f.get("lon", 0) or 0),
            "decayTransport": float(f.get("decay_transport", 0) or 0),
            "decayFood": float(f.get("decay_food", 0) or 0),
            "decayWorship": float(f.get("decay_worship", 0) or 0),
            "decayTotal": float(f.get("decay_total", 0) or 0),
            "tradeSpendLkr": float(b.get("Trade_Spend_LKR", 0) or 0),
            "predictedIncrementalLiters": float(b.get("predicted_incremental_liters", 0) or 0),
            "dominantMethod": p.get("dominant_method", ""),
            "adjustmentFactor": float(p.get("adjustment_factor", 1) or 1),
            "modelDrivers": build_model_drivers(
                oid,
                s,
                f,
                p,
                qr_model,
                norm_density_map.get(oid, 0.5),
            ),
        })

    outlets_path = APP_DATA / "outlets.json"
    with outlets_path.open("w", encoding="utf-8") as fh:
        json.dump({"outlets": outlets, "count": len(outlets)}, fh, separators=(",", ":"))

    western_budget = {
        r["Outlet_ID"]: float(r.get("Trade_Spend_LKR", 0) or 0)
        for r in budget.values()
    }
    budget_path = APP_DATA / "western_budget.json"
    with budget_path.open("w", encoding="utf-8") as fh:
        json.dump(western_budget, fh, separators=(",", ":"))

    summary = {}
    if OPT_REPORT.exists():
        with OPT_REPORT.open(encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                summary[row["metric"]] = row["value"]

    summary_path = APP_DATA / "optimization_summary.json"
    with summary_path.open("w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)

    generated_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "generatedAt": generated_at,
        "outletCount": len(outlets),
        "schemaVersion": 2,
        "xaiIncludesFeatureWeights": bool(qr_model),
        "outletFields": list(OUTLET_EXPORT_FIELDS),
        "sources": {
            "predictions_final": _file_meta(PRED_PATH),
            "outlet_features": _file_meta(FEAT_PATH),
            "outlet_stats": _file_meta(STATS_PATH),
            "budget_allocations_raw": _file_meta(BUDGET_PATH),
            "optimization_report": _file_meta(OPT_REPORT),
        },
        "outputs": {
            "outlets.json": _file_meta(outlets_path),
            "western_budget.json": _file_meta(budget_path),
            "optimization_summary.json": _file_meta(summary_path),
        },
    }
    pred_digest = hashlib.sha256(PRED_PATH.read_bytes()).hexdigest()[:16]
    manifest["predictions_sha256_prefix"] = pred_digest

    manifest_path = APP_DATA / "export_manifest.json"
    with manifest_path.open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)

    if outlets:
        missing = [k for k in OUTLET_EXPORT_FIELDS if k not in outlets[0]]
        if missing:
            print(f"  ERROR: export missing fields: {missing}")
            sys.exit(1)

    print(f"  Exported {len(outlets):,} outlets -> {outlets_path}")
    print(f"  Western budget map -> {budget_path}")
    print(f"  Optimization summary -> {summary_path}")
    print(f"  Export manifest -> {manifest_path}")
    print("\nPhase 6 export complete.")


if __name__ == "__main__":
    main()
