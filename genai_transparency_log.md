# Data Storm 7.0 — GenAI Transparency Log

**Competition:** Data Storm 7.0 — Rotaract Club of University of Moratuwa  
**Team: Stack Kings — GenAI usage disclosure (required by competition guidelines)**

---

## Tool Used

| Field | Details |
|---|---|
| Tool name | **Antigravity** (Google DeepMind Advanced Agentic Coding) |
| Model family | Gemini (Google DeepMind) |
| Access method | Integrated IDE assistant (agentic pair-programming) |
| Usage period | May 2026 (competition duration) |

---

## What GenAI Did

### 1. Pipeline Architecture Design
- Proposed the Bronze → Silver → Gold → Predictions medallion architecture
- Suggested the quarantine-first DE philosophy (reject with reason codes, never silently drop)
- Designed the 5-phase plan: Forensics → Cleaning → POI → Modeling → Deliverables

### 2. Code Generation (all scripts in `src/`)
All Python scripts were **AI-generated** based on human requirements:

| Script | Purpose |
|---|---|
| `ingest_manifest.py` | Bronze ingestion + SHA-256 manifest |
| `phase1_forensics.py` | Multi-dataset forensics analysis |
| `phase1_profile_enhanced.py` | Chunked profiling of 2.3M-row transactions |
| `de_checks.py` | Reusable parameterized DE check library |
| `phase2_silver.py` | Silver cleaning pipeline |
| `phase3_poi_acquire.py` | Overpass API POI scraper |
| `phase3_poi_synthetic.py` | Fallback synthetic POI generator |
| `phase3_gold_features.py` | Gold feature engineering |
| `phase4_aggregate.py` | Transaction aggregation |
| `phase4_model.py` | K-Means lookalike ceiling model |
| `phase4_validate.py` | Validation & sanity checks |
| `phase5_submit.py` | Final submission CSV generator |
| `phase5_generate_notebook.py` | Jupyter notebook generator |
| `audit_*.py` | Automated QA audit scripts |

**Round 2 scripts:** `spatial_decay.py`, `spatial_competition.py`, `phase4_predict.py`, `phase4_optimize.py`, `phase6_export_app_data.py`, `validate_xai_samples.py`, Next.js app in `app/`.

### 3. Data Forensics Interpretation
- Identified that 7,413 blackout outlets (no Dec 2025 data) represent a supply constraint signal, not true zero demand
- Flagged 200 swapped lat/lon coordinates in outlet_coordinates.csv
- Identified categorical typos: `Grocry`, `Bakry`, `small` etc. — totalling 1,385 affected rows

### 4. Modeling Methodology Selection
- Explained right-censoring in FMCG context (observed volume ≤ true demand)
- Chose Lookalike Cluster Ceiling over Tobit regression for interpretability and data-size efficiency
- Designed the Jan 2026 seasonality projection (most recent January per distributor)
- Specified the own-max floor constraint (prediction ≥ historical maximum)

### 5. Validation Framework
- Designed the 3-tier validation: sanity checks + backtest coverage + face validity
- Identified and fixed the bug where Jan seasonality factor was reducing predictions below own historical max

---

## What Humans Did

| Decision | Human role |
|---|---|
| Competition strategy | Selected which plan phases to prioritize |
| Business logic review | Confirmed blackout outlet treatment is defensible |
| Model sign-off | Reviewed validation results and confirmed 100% backtest coverage is acceptable |
| Submission decision | Final go/no-go on the submission |
| Competition rules compliance | Read and interpreted competition guidelines |

---

## Prompting Approach

The human user issued **natural language task directives** (e.g., "proceed to phase 3", "recheck whether phase 3 is 100% complete"). The AI:
1. Read and parsed `plan.md` autonomously
2. Wrote, executed, and debugged code in the project's `.venv`
3. Ran automated audit scripts to verify each phase before proceeding
4. Self-corrected issues (e.g., the prediction floor bug) without human intervention

---

## XAI Module (Round 2 — In-App Explainability)

**Important:** Generative AI does **not** compute `Maximum_Monthly_Liters` or trade spend. The pipeline writes all numbers; the LLM (or template) only narrates the exported `Outlet` JSON into a **structured explanation** (SWOT quadrants + business summary).

### Output schema (`app/lib/explainSchema.ts`)

| Field | Content |
|-------|---------|
| `swot.strengths` / `weaknesses` / `opportunities` / `threats` | Bullet lists with optional `ref` keys linking to chart metrics or QR drivers |
| `summary` | Plain-language business paragraph(s) |
| Repair path | `repairStructuredExplanation()` unwraps double-encoded or nested JSON from small local models |

Empty or malformed LLM quadrants are merged from `buildStructuredTemplateExplanation()`. Unit tests: `app/lib/explainSchema.test.ts` (`npm test` in `app/`).

### Resolution order

| Priority | Path | Condition |
|----------|------|-----------|
| 1 | Ollama (browser) | `NEXT_PUBLIC_OLLAMA_ENABLED=true`; model e.g. `gemma3:1b` |
| 2 | Gemini (server `/api/explain`) | Ollama skipped or fails; `GEMINI_API_KEY` set |
| 3 | Template | Always — deterministic structured SWOT + summary |

**Production cache:** When `DATABASE_URL` (Neon) is set, explanations are stored in `outlet_explanations` for instant reload.

### Prompting (summary)

LLMs are asked for **JSON only** matching the structured schema (SWOT + summary), not free-form paragraphs. Ollama uses `format: "json"` where supported; Gemini uses JSON schema response mode. See `app/lib/xaiShared.ts`, `app/lib/xaiClient.ts`, and `app/lib/xai.ts` for full prompt text.

**Default models:** `gemma3:1b` (Ollama), `gemini-2.5-flash` (Gemini). Ollama: `think: false`, `temperature: 0.2`, `num_predict` up to ~1536 for SWOT completeness.

**Template logic (deterministic drivers):** uplift % vs own max; drivers up (gap, decay transport/food, coolers, seasonality); drivers down (saturation, competition penalty, no cooler); Western spend + incremental liters when present.

### Feature importance / weights (PDF §4.1)

Per-outlet **`modelDrivers`** exported in `outlets.json` (built by `src/xai_feature_drivers.py`):

| Component | Content |
|-----------|---------|
| `qrTopDrivers` | Top 5 QR features with **weight** (β on z-scored inputs) and **contributionLiters** (β×z) |
| `qrInterceptLiters` | Global QR intercept from `metadata/qr_model.json` |
| `kmeansPeerSignal` | Cluster peer ceiling narrative |
| `competition` | `saturationPenalty`, `isolationBoost`, `combinedAdjustmentFactor` (γ=0.20, δ=0.10) |

Coefficients saved when running `phase4_quantile.py` → `metadata/qr_model.json`.

### Validation approach

| Layer | Script / artifact | Result |
|-------|-------------------|--------|
| Automated CI | `python src/validate_xai_samples.py` | **20/20** template — numbers + QR weights + competition terms |
| Unit tests | `cd app && npm test` | `explainSchema` repair/normalize |
| Live LLM (optional) | `python src/validate_xai_llm.py` | Spot-checks Ollama/Gemini; **skips** if unreachable (use `--strict` to fail) |
| Export contract | `app/public/data/export_manifest.json` | Schema v2 includes `modelDrivers` |
| Master audit | `audit_all.py` | QR model file, driver fields, XAI routes |

### Human review steps (completed)

1. Confirmed template paragraphs never invent metrics absent from JSON.
2. Spot-checked Western outlets with high `tradeSpendLkr` — narrative matched optimizer output.
3. Verified browser Ollama → server Gemini → template order in `xaiClient.ts` / explain API route.
4. Documented `think: false` for Gemma on Ollama (empty content without it).
5. Approved template-only demo path for judges without API keys.
6. SWOT `ref` cross-links validated in UI (`ExplainContent.tsx` + `explainRefs.ts`).

---

## Known Limitations & Caveats

1. **Synthetic POI data:** The Overpass API was unreachable from the build environment (406 errors on all endpoints). A geographically realistic synthetic dataset was generated using Sri Lanka population centres and published OSM node counts. The production code (`phase3_poi_acquire.py`) correctly targets Overpass; re-running it with internet access would replace the synthetic data automatically.

2. **Censoring model simplicity:** A full Tobit or survival analysis would be statistically more rigorous but requires `statsmodels` or `lifelines`. The K-Means lookalike ceiling is computationally lighter and highly interpretable.

3. **No causal identification:** The model identifies empirical ceilings, not causal demand drivers. The uplift from cluster ceiling is correlational.

4. **POI distance accuracy:** Planar Haversine approximation (not geodesic) introduces ~0.3% error at Sri Lanka's latitude — acceptable for the 1km/3km radius features.

---

## Reproducibility

**One command (Round 2 modeling → submissions → app → QA):**
```
python src/run_round2_pipeline.py
```

Full bronze→gold rebuild:
```
python src/run_round2_pipeline.py --full
```

Web app (Tailwind UI): `cd app && npm install && npm run build:clean && npm run start`

Pre-submit: `python src/verify_all.py`

Judge-facing docs: `docs/StackKings_Technical_Paper.md`, `docs/pitch_deck.md`, `docs/SUBMISSION.md`.

All modeling outputs are deterministic given the same input data (K-Means `seed=42`). LLM XAI text is non-deterministic when Ollama/Gemini are enabled.
