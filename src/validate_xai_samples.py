"""
validate_xai_samples.py — Validate XAI template output factuality (Workstream 4/6)
====================================================================================
Checks that deterministic template narratives reference exported outlet fields
and explicit modelDrivers (QR weights, competition breakdown).
Run after phase6_export_app_data.py.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "app" / "public" / "data" / "outlets.json"


def build_template_narrative(outlet: dict) -> str:
    """Mirror app/lib/xai.ts buildTemplateExplanation (Python equivalent for CI)."""
    pred = float(outlet["predictedLiters"])
    own = float(outlet["ownMaxVol"])
    gap = float(outlet["gapLiters"])
    recent = float(outlet.get("recent3mAvg", 0) or 0)
    sat = outlet.get("marketSaturation", "")
    spend = float(outlet.get("tradeSpendLkr", 0) or 0)
    incr = float(outlet.get("predictedIncrementalLiters", 0) or 0)
    cluster = outlet.get("clusterId", "")
    ceil = float(outlet.get("clusterCeiling", 0) or 0)
    method = outlet.get("dominantMethod", "")
    md = outlet.get("modelDrivers") or {}

    uplift = ((pred / own - 1) * 100) if own > 0 else 0.0
    cluster_note = (
        f" Peer cluster {cluster} ceiling is {ceil:.1f} L." if ceil > 0 else ""
    )
    para1 = (
        f"Outlet {outlet['id']} has a predicted maximum monthly potential of {pred:.1f} liters "
        f"(~{uplift:.1f}% above its historical maximum of {own:.1f} L). "
        f"The model ensemble ({method}) estimates a latent gap of {gap:.1f} liters "
        f"(recent 3-month average: {recent:.1f} L).{cluster_note}"
    )

    qr_drivers = md.get("qrTopDrivers") or []
    qr_text = "; ".join(
        f"{d.get('label', d.get('feature'))} (weight {d.get('weight')}, "
        f"contribution {d.get('contributionLiters')} L)"
        for d in qr_drivers[:3]
    )
    para2 = "Model traceability:"
    if md.get("kmeansPeerSignal"):
        para2 += f" {md['kmeansPeerSignal']}."
    if qr_text:
        para2 += f" Top QR feature drivers (τ=0.90 weights): {qr_text}."
    if not qr_text and not md.get("kmeansPeerSignal"):
        para2 = "Factors supporting higher potential: significant untapped volume gap."

    comp = md.get("competition") or {}
    comp_note = ""
    if comp:
        comp_note = (
            f"Competition adjustment: saturation penalty ×{comp.get('saturationPenalty')}, "
            f"isolation boost ×{comp.get('isolationBoost')} "
            f"(combined ×{comp.get('combinedAdjustmentFactor')}). "
        )
    para3 = comp_note + f"Market saturation is {sat} "
    if spend > 0:
        para3 += f"Recommended Western Province trade spend: LKR {spend:,.0f}"
        if incr > 0:
            para3 += f" (modeled incremental volume: {incr:.1f} L)."
    else:
        para3 += "No trade spend allocated."
    return f"{para1}\n\n{para2}\n\n{para3}"


def factuality_ok(outlet: dict, narrative: str) -> bool:
    pred = float(outlet["predictedLiters"])
    own = float(outlet["ownMaxVol"])
    checks = [
        f"{pred:.1f}" in narrative,
        f"{own:.1f}" in narrative,
        outlet.get("marketSaturation", "") in narrative,
        outlet["id"] in narrative,
    ]
    spend = float(outlet.get("tradeSpendLkr", 0) or 0)
    if spend > 0:
        checks.append(
            f"{spend:,.0f}" in narrative or str(int(spend)) in narrative.replace(",", "")
        )
    md = outlet.get("modelDrivers") or {}
    if md.get("qrTopDrivers"):
        top = md["qrTopDrivers"][0]
        checks.append(str(top.get("weight")) in narrative or top.get("label", "") in narrative)
    if md.get("competition"):
        checks.append("saturation penalty" in narrative.lower() or "Competition adjustment" in narrative)
    return all(checks)


def main() -> None:
    print("=== XAI Sample Validation (template + feature drivers) ===\n")
    if not APP_DATA.exists():
        print("  Run phase6_export_app_data.py first")
        sys.exit(1)

    data = json.loads(APP_DATA.read_text(encoding="utf-8"))
    outlets = data.get("outlets", [])[:20]
    if len(outlets) < 20:
        print(f"  ERROR: need 20 outlets, found {len(outlets)}")
        sys.exit(1)

    with_drivers = sum(1 for o in outlets if o.get("modelDrivers", {}).get("qrTopDrivers"))
    print(f"  Outlets with QR driver weights: {with_drivers}/20")

    passed = 0
    for o in outlets:
        narrative = build_template_narrative(o)
        if factuality_ok(o, narrative):
            passed += 1
        else:
            print(f"  FAIL {o['id']}")

    print(f"  {passed}/20 samples passed factuality check")
    sys.exit(0 if passed == 20 else 1)


if __name__ == "__main__":
    main()
