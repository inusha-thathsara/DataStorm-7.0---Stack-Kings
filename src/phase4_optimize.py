"""
phase4_optimize.py — LKR 5M Western Province trade spend optimization (Workstream 3)
===================================================================================
Maximizes incremental volume vs recent-3m baseline using a diminishing-returns curve:

    delta_vol_i(x) = gap_i * (1 - exp(-alpha_i * x / 1000))

Piecewise-linearized for LP (scipy.optimize.linprog / HiGHS) with segments per outlet.
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import linprog

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
PRED_PATH = ROOT / "gold" / "predictions" / "predictions_final.csv"
STATS_PATH = ROOT / "gold" / "features" / "outlet_stats.csv"
OUT_RAW = ROOT / "gold" / "predictions" / "budget_allocations_raw.csv"
OUT_SUB = ROOT / "submissions" / "StackKings_budget_allocations.csv"
OUT_REPORT = ROOT / "metadata" / "optimization_report.csv"
OUT_SUMMARY = ROOT / "metadata" / "optimization_pitch_summary.csv"

BUDGET = 5_000_000.0
WESTERN_DISTRIBUTORS = {"DIST_W_01", "DIST_W_02", "DIST_W_03"}
ALPHA_BASE = 0.8
MAX_SPEND_PER_OUTLET = 50_000.0
UNIT_PRICE_LKR_PER_L = 50.0  # for optional per-outlet spend cap
NAIVE_TOP_N = 500
# Optional minimum spend for top gap outlets (plan 3A)
TOP_N_FLOOR_OUTLETS = 100
MIN_SPEND_FLOOR_LKR = 2_000.0

# Piecewise breakpoints (LKR) — plan: 0, 500, 2000, 10000 (+ cap at 50k)
SEGMENT_BREAKPOINTS = [0.0, 500.0, 2000.0, 10000.0, MAX_SPEND_PER_OUTLET]
N_SEGMENTS = len(SEGMENT_BREAKPOINTS) - 1


def read_csv_dict(path: Path) -> dict[str, dict]:
    with path.open("r", encoding="utf-8", errors="replace", newline="") as fh:
        return {r["Outlet_ID"].strip(): r for r in csv.DictReader(fh)}


def response_volume(gap: float, alpha: float, spend: float) -> float:
    if gap <= 0 or spend <= 0:
        return 0.0
    return gap * (1.0 - np.exp(-alpha * spend / 1000.0))


def segment_widths() -> list[float]:
    return [
        SEGMENT_BREAKPOINTS[s + 1] - SEGMENT_BREAKPOINTS[s]
        for s in range(N_SEGMENTS)
    ]


def segment_marginal_liters_per_lkr(gap: float, alpha: float, seg: int) -> float:
    """Marginal yield on segment seg (liters per LKR), decreasing in seg for concave response."""
    t0 = SEGMENT_BREAKPOINTS[seg]
    t1 = SEGMENT_BREAKPOINTS[seg + 1]
    w = t1 - t0
    if w <= 0 or gap <= 0:
        return 0.0
    v0 = response_volume(gap, alpha, t0)
    v1 = response_volume(gap, alpha, t1)
    return (v1 - v0) / w


def per_outlet_spend_cap(gap: float) -> float:
    """Optional cap: min(50k, 5% of gap value at unit price)."""
    if gap <= 0:
        return 0.0
    value_cap = 0.05 * gap * UNIT_PRICE_LKR_PER_L
    return min(MAX_SPEND_PER_OUTLET, max(500.0, value_cap))


def solve_piecewise_lp(
    candidates: list[dict],
    floor_constraints: list[tuple[int, float]] | None = None,
) -> dict[str, float]:
    """
    Decision variables: y[i,s] = LKR spent in segment s for outlet i.
    Maximize sum_{i,s} marginal_{i,s} * y[i,s]
    s.t. sum_{i,s} y[i,s] <= BUDGET, 0 <= y[i,s] <= width_s, sum_s y[i,s] <= cap_i.
    Optional: sum_s y_{i,s} >= floor_lkr for each (index, floor_lkr) in floor_constraints.
    """
    n = len(candidates)
    if n == 0:
        return {}

    widths = segment_widths()
    n_vars = n * N_SEGMENTS

    # Objective: maximize marginal volume => minimize negative marginals
    c = np.zeros(n_vars, dtype=np.float64)
    for i, cand in enumerate(candidates):
        gap, alpha = cand["gap"], cand["alpha"]
        for s in range(N_SEGMENTS):
            idx = i * N_SEGMENTS + s
            c[idx] = -segment_marginal_liters_per_lkr(gap, alpha, s)

    # Budget constraint: sum y <= BUDGET
    A_ub = [np.ones(n_vars, dtype=np.float64)]
    b_ub = [BUDGET]

    # Per-outlet cap: sum_s y_{i,s} <= cap_i
    for i, cand in enumerate(candidates):
        row = np.zeros(n_vars, dtype=np.float64)
        for s in range(N_SEGMENTS):
            row[i * N_SEGMENTS + s] = 1.0
        A_ub.append(row)
        b_ub.append(cand["spend_cap"])

    for i, floor_lkr in floor_constraints or []:
        if floor_lkr <= 0:
            continue
        row = np.zeros(n_vars, dtype=np.float64)
        for s in range(N_SEGMENTS):
            row[i * N_SEGMENTS + s] = -1.0
        A_ub.append(row)
        b_ub.append(-floor_lkr)

    A_ub_arr = np.vstack(A_ub)
    b_ub_arr = np.array(b_ub, dtype=np.float64)

    bounds = []
    for _i, cand in enumerate(candidates):
        cap = cand["spend_cap"]
        for s in range(N_SEGMENTS):
            hi = min(widths[s], cap)  # segment bound (cap enforced by row constraint too)
            bounds.append((0.0, hi))

    res = linprog(
        c=c,
        A_ub=A_ub_arr,
        b_ub=b_ub_arr,
        bounds=bounds,
        method="highs",
    )

    if not res.success:
        print(f"  WARNING: linprog status={res.message}; retrying with revised simplex")
        res = linprog(
            c=c,
            A_ub=A_ub_arr,
            b_ub=b_ub_arr,
            bounds=bounds,
            method="revised simplex",
        )

    if not res.success:
        raise RuntimeError(f"Budget LP failed: {res.message}")

    allocation: dict[str, float] = {}
    x = res.x
    for i, cand in enumerate(candidates):
        spend = sum(x[i * N_SEGMENTS + s] for s in range(N_SEGMENTS))
        allocation[cand["Outlet_ID"]] = float(spend)

    # Scale down if numerical tolerance pushed total over budget
    total = sum(allocation.values())
    if total > BUDGET:
        scale = BUDGET / total
        for oid in allocation:
            allocation[oid] = round(allocation[oid] * scale, 2)

    for oid in allocation:
        allocation[oid] = round(allocation[oid], 2)

    return allocation


def naive_baseline_volume(candidates: list[dict], top_n: int = NAIVE_TOP_N) -> tuple[float, float]:
    """Top-N outlets by predicted potential (Maximum_Monthly_Liters), equal budget split."""
    ranked = sorted(candidates, key=lambda c: -c["predicted"])
    top = [c for c in ranked[:top_n] if c["gap"] > 0]
    if not top:
        return 0.0, 0.0
    per_outlet = BUDGET / len(top)
    total_vol = sum(response_volume(c["gap"], c["alpha"], per_outlet) for c in top)
    return total_vol, per_outlet


def main() -> None:
    print("=== Phase 4 - LKR 5M Budget Optimization (Workstream 3 — Piecewise LP) ===\n")

    if not PRED_PATH.exists():
        print(f"  ERROR: Run phase4_predict.py first ({PRED_PATH})")
        sys.exit(1)

    preds = read_csv_dict(PRED_PATH)
    stats = read_csv_dict(STATS_PATH) if STATS_PATH.exists() else {}

    western_rows = [
        (oid, preds[oid])
        for oid in sorted(preds.keys())
        if preds[oid].get("distributor_id", "").strip() in WESTERN_DISTRIBUTORS
    ]
    print(f"  Western Province outlets: {len(western_rows):,}")

    density_vals = []
    for _, row in western_rows:
        try:
            density_vals.append(float(row.get("competitor_density_z", 0) or 0))
        except ValueError:
            density_vals.append(0.0)
    arr = np.array(density_vals, dtype=np.float64)
    mu, sd = float(arr.mean()), float(arr.std())
    sd = sd if sd > 0 else 1.0
    norm_density = (arr - mu) / sd

    candidates = []
    for i, (oid, row) in enumerate(western_rows):
        s = stats.get(oid, {})
        try:
            pred = float(row.get("Maximum_Monthly_Liters", 0) or 0)
            baseline = float(s.get("recent_3m_avg", 0) or 0)
            gap = max(pred - baseline, 0.0)
        except ValueError:
            pred, baseline, gap = 0.0, 0.0, 0.0

        nd = float(norm_density[i]) if i < len(norm_density) else 0.0
        alpha = ALPHA_BASE * (1.0 - 0.3 * max(-1.0, min(1.0, nd / 3.0)))
        spend_cap = per_outlet_spend_cap(gap)

        candidates.append({
            "Outlet_ID": oid,
            "gap": gap,
            "alpha": alpha,
            "predicted": pred,
            "baseline": baseline,
            "distributor_id": row.get("distributor_id", ""),
            "competitor_density_z": row.get("competitor_density_z", 0),
            "market_saturation_label": row.get("market_saturation_label", ""),
            "seasonality_jan2026_label": "",
            "spend_cap": spend_cap,
        })

    # Seasonality from features if available
    feats = read_csv_dict(ROOT / "gold" / "features" / "outlet_features.csv")
    for c in candidates:
        f = feats.get(c["Outlet_ID"], {})
        c["seasonality_jan2026_label"] = f.get("seasonality_jan2026_label", "Moderate")

    gap_ranked = sorted(
        [i for i, c in enumerate(candidates) if c["gap"] > 0],
        key=lambda i: -candidates[i]["gap"],
    )
    floor_n = TOP_N_FLOOR_OUTLETS
    floor_constraints: list[tuple[int, float]] = []
    for i in gap_ranked[:floor_n]:
        cap = candidates[i]["spend_cap"]
        floor_amt = min(MIN_SPEND_FLOOR_LKR, cap)
        if floor_amt >= 500.0:
            floor_constraints.append((i, floor_amt))
    total_floor = sum(f for _, f in floor_constraints)
    while floor_constraints and total_floor > BUDGET * 0.85:
        floor_constraints.pop()
        total_floor = sum(f for _, f in floor_constraints)
    if floor_constraints:
        print(
            f"  Min spend floor: {len(floor_constraints)} top-gap outlets "
            f"(LKR {total_floor:,.0f} minimum committed)"
        )

    print("  Solving piecewise LP (linprog / HiGHS) ...")
    allocation = solve_piecewise_lp(candidates, floor_constraints)

    # Trim rounding overshoot on budget cap
    while sum(allocation.values()) > BUDGET + 0.001:
        oid = max(allocation, key=lambda k: allocation[k])
        allocation[oid] = round(max(0.0, allocation[oid] - 0.01), 2)

    raw_rows = []
    total_spend = 0.0
    total_delta = 0.0
    dist_spend: dict[str, float] = defaultdict(float)
    sat_spend: dict[str, float] = defaultdict(float)
    sat_delta: dict[str, float] = defaultdict(float)
    sat_count: dict[str, int] = defaultdict(int)
    seas_spend: dict[str, float] = defaultdict(float)
    seas_delta: dict[str, float] = defaultdict(float)
    seas_count: dict[str, int] = defaultdict(int)

    for c in candidates:
        oid = c["Outlet_ID"]
        spend = allocation.get(oid, 0.0)
        delta = response_volume(c["gap"], c["alpha"], spend)
        total_spend += spend
        total_delta += delta
        did = c["distributor_id"]
        dist_spend[did] += spend
        sat = c["market_saturation_label"] or "unknown"
        sat_spend[sat] += spend
        sat_delta[sat] += delta
        sat_count[sat] += 1
        seas = c["seasonality_jan2026_label"] or "Moderate"
        seas_spend[seas] += spend
        seas_delta[seas] += delta
        seas_count[seas] += 1
        raw_rows.append({
            "Outlet_ID": oid,
            "Distributor_ID": did,
            "Trade_Spend_LKR": round(spend, 2),
            "gap_liters": round(c["gap"], 4),
            "baseline_recent_3m_avg": round(c["baseline"], 4),
            "alpha": round(c["alpha"], 4),
            "spend_cap_lkr": round(c["spend_cap"], 2),
            "predicted_incremental_liters": round(delta, 4),
            "Maximum_Monthly_Liters": round(c["predicted"], 4),
            "market_saturation_label": sat,
            "seasonality_jan2026_label": c["seasonality_jan2026_label"],
        })

    raw_rows.sort(key=lambda r: r["Outlet_ID"])
    OUT_RAW.parent.mkdir(parents=True, exist_ok=True)
    with OUT_RAW.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(raw_rows[0].keys()))
        writer.writeheader()
        writer.writerows(raw_rows)

    sub_rows = [{"Outlet_ID": r["Outlet_ID"], "Trade_Spend_LKR": r["Trade_Spend_LKR"]} for r in raw_rows]
    with OUT_SUB.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["Outlet_ID", "Trade_Spend_LKR"])
        writer.writeheader()
        writer.writerows(sub_rows)

    naive_delta, naive_per = naive_baseline_volume(candidates)
    lift_pct = 100.0 * (total_delta - naive_delta) / naive_delta if naive_delta > 0 else 0.0
    budget_slack = BUDGET - total_spend
    roi = 1000.0 * total_delta / total_spend if total_spend > 0 else 0.0

    report_rows = [
        {"metric": "solver_method", "value": "piecewise_lp_linprog_highs"},
        {"metric": "total_spend_lkr", "value": f"{total_spend:,.2f}"},
        {"metric": "budget_limit_lkr", "value": f"{BUDGET:,.2f}"},
        {"metric": "budget_slack_lkr", "value": f"{budget_slack:,.2f}"},
        {"metric": "budget_utilization_pct", "value": f"{100*total_spend/BUDGET:.2f}"},
        {"metric": "total_incremental_liters", "value": f"{total_delta:,.2f}"},
        {"metric": "roi_liters_per_1000_lkr", "value": f"{roi:.4f}"},
        {"metric": "outlets_with_spend", "value": str(sum(1 for r in raw_rows if r["Trade_Spend_LKR"] > 0))},
        {"metric": "naive_top_n", "value": str(NAIVE_TOP_N)},
        {"metric": "naive_ranking", "value": "top_by_predicted_potential"},
        {"metric": "min_spend_floor_target_lkr", "value": f"{MIN_SPEND_FLOOR_LKR:,.2f}"},
        {"metric": "min_spend_floor_outlets", "value": str(len(floor_constraints))},
        {"metric": "min_spend_floor_committed_lkr", "value": f"{total_floor:,.2f}"},
        {"metric": "naive_equal_spend_lkr", "value": f"{naive_per:,.2f}"},
        {"metric": "naive_baseline_liters", "value": f"{naive_delta:,.2f}"},
        {"metric": "optimizer_lift_pct", "value": f"{lift_pct:.2f}"},
    ]
    for did, sp in sorted(dist_spend.items()):
        report_rows.append({"metric": f"spend_{did}", "value": f"{sp:,.2f}"})

    with OUT_REPORT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=["metric", "value"])
        writer.writeheader()
        writer.writerows(report_rows)

    # Workstream 3B: pitch summary by saturation
    pitch_rows = []
    for sat in sorted(sat_spend.keys()):
        n = sat_count[sat]
        sp = sat_spend[sat]
        dl = sat_delta[sat]
        pitch_rows.append({
            "segment": "market_saturation",
            "label": sat,
            "n_outlets": n,
            "total_spend_lkr": round(sp, 2),
            "total_incremental_liters": round(dl, 2),
            "avg_spend_per_outlet": round(sp / n, 2) if n else 0,
            "liters_per_1000_lkr": round(1000 * dl / sp, 4) if sp > 0 else 0,
        })

    for seas in sorted(seas_spend.keys()):
        n = seas_count[seas]
        sp = seas_spend[seas]
        dl = seas_delta[seas]
        pitch_rows.append({
            "segment": "seasonality_jan2026",
            "label": seas,
            "n_outlets": n,
            "total_spend_lkr": round(sp, 2),
            "total_incremental_liters": round(dl, 2),
            "avg_spend_per_outlet": round(sp / n, 2) if n else 0,
            "liters_per_1000_lkr": round(1000 * dl / sp, 4) if sp > 0 else 0,
        })

    # Top gap tier: top 25% vs bottom 25% by gap among outlets with spend
    with_gap = [c for c in candidates if c["gap"] > 0]
    with_gap.sort(key=lambda c: -c["gap"])
    q = max(1, len(with_gap) // 4)
    top_gap = with_gap[:q]
    bot_gap = with_gap[-q:] if len(with_gap) >= q else []
    for label, group in [("top_quartile_gap", top_gap), ("bottom_quartile_gap", bot_gap)]:
        sp = sum(allocation.get(c["Outlet_ID"], 0) for c in group)
        dl = sum(response_volume(c["gap"], c["alpha"], allocation.get(c["Outlet_ID"], 0)) for c in group)
        pitch_rows.append({
            "segment": "gap_quartile",
            "label": label,
            "n_outlets": len(group),
            "total_spend_lkr": round(sp, 2),
            "total_incremental_liters": round(dl, 2),
            "avg_spend_per_outlet": round(sp / len(group), 2) if group else 0,
            "liters_per_1000_lkr": round(1000 * dl / sp, 4) if sp > 0 else 0,
        })

    with OUT_SUMMARY.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(pitch_rows[0].keys()))
        writer.writeheader()
        writer.writerows(pitch_rows)

    print(f"  Total spend: LKR {total_spend:,.2f} / {BUDGET:,.2f} ({100*total_spend/BUDGET:.1f}% utilized)")
    print(f"  Budget slack: LKR {budget_slack:,.2f}")
    print(f"  Incremental volume: {total_delta:,.1f} L")
    print(f"  ROI: {roi:.2f} L per 1,000 LKR")
    print(
        f"  Optimizer lift vs naive top-{NAIVE_TOP_N} "
        f"(by predicted potential): {lift_pct:.1f}%"
    )
    print(f"  Budget allocations -> {OUT_SUB}")
    print(f"  Pitch summary -> {OUT_SUMMARY}")
    print("\nPhase 4 optimization complete.")


if __name__ == "__main__":
    main()
