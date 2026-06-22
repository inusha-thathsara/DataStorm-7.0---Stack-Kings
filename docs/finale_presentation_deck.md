# Stack Kings — Grand Finale Presentation Deck (14 Slides)

**Data Storm 7.0 · Grand Finale · Team: Stack Kings**  
**Format:** 10-minute pitch (≈40–45 sec per slide) · Export to PDF or Google Slides  
**Companion:** `docs/finale_deliverables.md` · `docs/pitch_script_judging_panel.md`

---

## Slide 1 — Problem Statement

**Historical sales fund the past — not the future.**

- FMCG trade teams allocate coolers, promotions, and **trade spend** using **invoice history**
- Two shops on the same street can look identical on paper but differ completely:
  - **Under-stocked kade** → low liters ≠ low demand (stock/credit constraints)
  - **Maxed-out village shop** → more spend won't move volume
- Observed volume is **right-censored**: deliveries are a **lower bound** on true demand
- **Result:** High-potential outlets stay under-funded; saturated outlets absorb budget

**Thesis:** *"We're funding history, not potential."*

---

## Slide 2 — Business Understanding

**Industry:** FMCG beverage distribution · Sri Lanka · 20,000 retail outlets · 10 distributors · 4 provinces

**Stakeholders we serve:**

| Role | Need |
|------|------|
| **Trade marketing managers** | Where to deploy LKR promotional budget |
| **Field sales reps** | Which outlets to visit and why |
| **Distributor planners** | Territory-level spend by route |
| **Commercial leadership** | ROI and auditable allocation |

**Round 2 business challenge:**

- Estimate **January 2026 maximum monthly potential** for every outlet
- Allocate **LKR 5,000,000** Western Province trade spend to maximize **incremental liters**
- Deliver **field-ready** decision support — not just a CSV

**Target users:** Western Province distributors (**DIST_W_01–W_03**) first → national scale

---

## Slide 3 — Dataset Overview

**Competition datasets (5 files):**

| Dataset | Scale | Role |
|---------|-------|------|
| `transactions_history_final.csv` | **~2.3M rows** | Monthly outlet-SKU volumes |
| `outlet_master.csv` | 20,000 outlets | Size, type, coolers |
| `outlet_coordinates.csv` | 20,000 geocodes | Lat/lon for spatial features |
| `distributor_seasonality_details.csv` | 10 distributors | January seasonality labels |
| `holiday_list.csv` | National holidays | Calendar context |

**Scope:**

- **20,000 outlets** scored → `StackKings_predictions.csv`
- **~9,000 Western Province outlets** → `StackKings_budget_allocations.csv`
- **January 2026** prediction horizon · **LKR 5M** optimization budget

**External enrichment:** OpenStreetMap POIs (education, transport, food, worship, market, health, tourism)

---

## Slide 4 — Data Preparation

**Medallion lakehouse architecture:**

```
Bronze (immutable ingest + SHA-256 manifest)
    → Silver (clean + quarantine)
    → Gold (features + stats)
    → Predictions + Optimizer
```

**Data quality philosophy:** Reject with reason codes — **never silently drop**

| Metric | Value |
|--------|--------|
| Records quarantined | **37,205** |
| Reusable DE checks | 5 parameterized functions (`de_checks.py`) |
| Key fixes | 200 swapped lat/lon · categorical typos · blackout outlets flagged |

**Silver outputs:** Clean transactions, outlet master, coordinates  
**Gold outputs:** `outlet_stats.csv`, `outlet_features.csv`, POI decay features

**Reproducibility:** `python src/run_round2_pipeline.py` (or `--full` from raw CSVs)

---

## Slide 5 — Exploratory Data Analysis

**Key forensic findings that shaped our model:**

| Finding | Business implication |
|---------|---------------------|
| **7,413 blackout outlets** (no Dec 2025 data) | Supply constraint signal — not true zero demand |
| **Right-skewed monthly volumes** | Mean ≠ ceiling; need upper-tail methods |
| **Strong geographic clustering** | Flat "3 km counts" miss distance decay |
| **Competitor density varies 10×+** | Saturation vs isolation needs adjustment |
| **January seasonality differs by distributor** | Favorable / Moderate / Un-Favorable labels |

**EDA outputs:** `metadata/` profiling reports · spatial comparison (decay vs legacy disk counts)  
**Insight:** Invoice data alone cannot estimate latent ceiling — peer + feature + spatial signals required

---

## Slide 6 — Methodology

**End-to-end approach: Potential-Based Allocation**

```
Latent demand estimation  →  Competition adjustment  →  January seasonality
         →  Piecewise LP budget optimization  →  Field web app + XAI
```

**Latent ceiling (two independent methods):**

1. **K-Means lookalike ceilings (K=50)** — 90th percentile of peer max volumes per cluster
2. **Quantile regression (τ=0.90)** — feature-driven upper tail

**Ensemble:** `max(K-Means base, QR raw)` — take the stronger defensible signal

**Spatial intelligence:**

- Exponential POI decay: `Σ exp(−β·distance)` — not flat radius counts
- DBSCAN zones + competitor density → saturation penalty / isolation boost

**Optimization:** Diminishing-returns response curve → **piecewise linear program** (HiGHS)

---

## Slide 7 — Model Development

### A. K-Means lookalike ceiling (`phase4_model.py`)

- Features: volume stats, coolers, POI decay, seasonality
- **Cluster ceiling** = P90 of `max_monthly_vol` among peers
- **Outlet base** = `max(1.05 × p90, own_max, cluster_ceiling)`

### B. Quantile regression (`phase4_quantile.py`)

- Target: `max_monthly_vol` · Features: outlet + spatial + seasonality
- Pinball loss at **τ = 0.90** → conditional upper-tail estimate

### C. Unified prediction (`phase4_predict.py`)

```
adjusted_ceiling = ensemble × competition_adjustment
prediction = max(adjusted_ceiling × jan_factor, own_max, 1.0)
[+ cooler replenishment soft floor]
→ Maximum_Monthly_Liters
```

### D. Budget optimizer (`phase4_optimize.py`)

```
Δvol(x) = gap × (1 − exp(−α·x/1000))
```

Piecewise segments: **0 → 500 → 2,000 → 10,000 → 50,000 LKR** · maximize incremental liters subject to **LKR 5M** budget

---

## Slide 8 — Model Evaluation

| Metric | Result | Interpretation |
|--------|--------|----------------|
| Predictions below own historical max | **0** | Hard floor enforced — 100% backtest coverage |
| Median uplift (pred / own max) | **1.26×** | Conservative but meaningful headroom |
| QR test-set coverage (≥ own max) | **89.8%** | Feature model aligns with observed ceilings |
| XAI template factuality | **20/20** | Explain text matches pipeline numbers |
| Automated QA (`audit_all.py`) | **327 PASS / 0 FAIL** | Reproducible, submission-ready |

**Optimizer evaluation:**

| Strategy | Incremental liters | Notes |
|----------|-------------------|--------|
| **Piecewise LP (ours)** | **1,004,555 L** | Marginal allocation across 6,395 outlets |
| Naive top-500 equal split | 284,521 L | Same budget, same response curve |
| **Lift** | **+253%** | Documented in `optimization_report.csv` |

---

## Slide 9 — Key Insights

1. **Gap beats size for allocation** — high *predicted* outlets with high recent baseline have little incremental headroom
2. **Spatial decay matters** — transport/food POIs at 200 m dominate POIs at 2 km (β-calibrated tiers)
3. **Crowded catchments convert spend slower** — density-adjusted α in the optimizer response curve
4. **Ensemble max is conservative-but-ambitious** — peers and QR catch different uplift patterns
5. **Top-quartile gap outlets earn ~54% of spend** but deliver **253 L per LKR 1,000** vs **86 L** for bottom quartile
6. **Explainability builds trust** — reps need *why*, not just *how much*

**Surprise:** Equal LKR 10,000 × 500 "biggest" outlets wastes ~72% of incremental volume vs optimized marginal allocation

---

## Slide 10 — Business Impact

| KPI | Value |
|-----|--------|
| Outlets with latent potential scored | **20,000** |
| Western trade budget deployed | **LKR 5,000,000** (100%) |
| Modeled incremental volume | **~1.00 million liters** |
| ROI | **~201 liters per LKR 1,000** |
| Optimizer lift vs naive baseline | **+253%** |
| Distributor split (balanced) | ~1.67M / 1.66M / 1.68M LKR |

**Value for FMCG leadership:**

- Shift from gut-feel equal splits to **auditable, marginal-ROI allocation**
- Field teams get **one-screen decision support** with trade spend + explanation
- Monthly pipeline refresh path → living system, not one-off hackathon model

**CFO framing:** Every rupee tied to a point on a diminishing-returns response curve

---

## Slide 11 — Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                  │
│  Bronze → Silver → Gold │ Quarantine │ POI (OSM + decay)   │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  MODEL LAYER                                                 │
│  K-Means ceilings │ QR τ=0.90 │ Ensemble │ Competition adj  │
│  → predictions_final.csv → StackKings_predictions.csv        │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  OPTIMIZATION LAYER                                          │
│  Piecewise LP (HiGHS) → StackKings_budget_allocations.csv    │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER                                           │
│  Next.js Outlet Intelligence App (stackkings.inusha.me)       │
│  Neon Postgres API │ Filter/Sort/Compare │ Explain + cache   │
└─────────────────────────────────────────────────────────────┘
```

**Deployment:** Vercel (HTTPS) · Neon Postgres · Gemini Explain (cloud) · Ollama (local demo) · Template fallback (offline)  
**Governance:** `genai_transparency_log.md` · 327 automated checks · full git reproducibility

---

## Slide 12 — Application Demonstration

**Outlet Intelligence Web App** *(Next.js — field-ready alternative to Streamlit)*

**Live URL:** https://stackkings.inusha.me

| Feature | User action | Output |
|---------|-------------|--------|
| **Optimization summary** | Open home | LKR 5M, incremental L, ROI, lift % |
| **Browse** | Scroll table | 20,000 outlets — predicted, gap, trade spend |
| **Filter & sort** | Province, distributor, presets; sort gap/ID/spend | URL-synced shareable views |
| **Compare** | Select two outlets → Compare | Side-by-side metrics + charts; swap via ID picker |
| **Map** | Scroll map section | Geographic spend highlights |
| **Drill-down** | Click outlet ID | Ceilings, competition, POI decay, spend |
| **Explain** | One click | Structured SWOT + summary; Ollama/Gemini/Template badge |
| **Share** | Copy link / Markdown / Print | Field briefings and audit trail |

**5-minute demo follows this slide.**

*Screenshots: home table · Western filter · compare page · outlet detail · Explain SWOT panel*

---

## Slide 13 — Future Improvements

| Horizon | Improvement |
|---------|-------------|
| **Near-term** | Pilot with DIST_W_01–W_03 sales teams · monthly transaction refresh |
| **Data** | Live ERP / distributor feed · replace synthetic POI with full OSM re-scrape |
| **Model** | β grid-search on holdout · outlet-level response curves from A/B promo history |
| **Optimizer** | Multi-period budget · provincial expansion beyond Western |
| **App** | Role-based auth · offline PWA · Sinhala/Tamil Explain |
| **XAI** | Distributor-specific prompt templates |
| **MLOps** | Scheduled pipeline on cloud · drift monitoring on gap distributions |

**Ethical guardrails:** LLM explains only pre-computed numbers · quarantine audit trail · disclosed GenAI development log

---

## Slide 14 — Conclusion

**Stack Kings** delivers an end-to-end **Potential-Based Allocation** platform:

✓ **Latent demand** — K-Means + QR ensemble, spatially adjusted, January-scaled  
✓ **Optimized spend** — LKR 5M → ~1M incremental liters (+253% vs naive)  
✓ **Field-ready app** — live at **stackkings.inusha.me** with explainable AI  
✓ **Enterprise rigor** — 37k quarantined rows traced · 327 QA checks · full reproducibility  

**We don't fund history. We fund potential.**

**Thank you — we welcome your questions and our live demonstration.**

---

*Stack Kings · Data Storm 7.0 Grand Finale*
