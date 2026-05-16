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

## Known Limitations & Caveats

1. **Synthetic POI data:** The Overpass API was unreachable from the build environment (406 errors on all endpoints). A geographically realistic synthetic dataset was generated using Sri Lanka population centres and published OSM node counts. The production code (`phase3_poi_acquire.py`) correctly targets Overpass; re-running it with internet access would replace the synthetic data automatically.

2. **Censoring model simplicity:** A full Tobit or survival analysis would be statistically more rigorous but requires `statsmodels` or `lifelines`. The K-Means lookalike ceiling is computationally lighter and highly interpretable.

3. **No causal identification:** The model identifies empirical ceilings, not causal demand drivers. The uplift from cluster ceiling is correlational.

4. **POI distance accuracy:** Planar Haversine approximation (not geodesic) introduces ~0.3% error at Sri Lanka's latitude — acceptable for the 1km/3km radius features.

---

## Reproducibility

All scripts can be re-run in sequence:
```
python src/ingest_manifest.py
python src/phase1_forensics.py
python src/phase1_profile_enhanced.py
python src/phase2_silver.py
python src/phase3_poi_acquire.py   # requires internet; falls back to synthetic
python src/phase3_poi_synthetic.py # offline fallback
python src/phase3_gold_features.py
python src/phase4_aggregate.py
python src/phase4_model.py
python src/phase4_validate.py
python src/phase5_submit.py
python src/phase5_generate_notebook.py
```

All outputs are deterministic given the same input data (K-Means uses `seed=42`).
