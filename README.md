# Data Storm 7.0 — README
**Team: Stack Kings** · **Stage:** Round 2 (2nd Round submission — Top 10 selection)

This document explains how to reproduce our solution **end to end**: data pipeline → submission CSVs → web app export → QA.

---

## Run the pipeline end to end

### Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Python 3.11+** | Pipeline scripts in `src/` |
| **numpy, scipy, requests** | `pip install numpy scipy requests` (or use a venv below) |
| **Node.js 18+** | Web app only — see [Run the web app](#run-the-web-app) |
| **Competition CSVs** | Required only for a **full rebuild** (`--full`); see below |

From the **repository root** (where this `README.md` lives):

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
.venv\Scripts\pip install numpy scipy requests
# macOS/Linux:
# source .venv/bin/activate && pip install numpy scipy requests
```

### Option A — Standard run (recommended after clone)

The repo includes cleaned **silver/gold** outputs. Re-run modeling, optimization, submissions, app export, and QA **without** re-ingesting raw competition files:

```bash
python src/run_round2_pipeline.py
```

**Expected result:** `327 PASS / 0 FAIL` from `audit_all.py` (last step).

**Outputs written:**

| Output | Path |
|--------|------|
| Latent potential (20,000 outlets) | `submissions/StackKings_predictions.csv` |
| Western Province trade spend | `submissions/StackKings_budget_allocations.csv` |
| Full prediction trace | `gold/predictions/predictions_final.csv` |
| Web app outlet bundle (~40 MB, local only) | `app/public/data/outlets.json` |

### Option B — Full rebuild from raw competition data

Use when you have the organizer dataset and want to rebuild bronze → silver → gold from scratch.

1. Place the five competition CSVs in `datastorm-7-0-rotaract/` (read-only; never edit in place):
   - `transactions_history_final.csv`
   - `outlet_master.csv`
   - `outlet_coordinates.csv`
   - `distributor_seasonality_details.csv`
   - `holiday_list.csv`

2. Run:

```bash
python src/run_round2_pipeline.py --full
```

This runs bronze ingest, forensics, silver cleaning, POI acquire (Overpass) + synthetic fallback, gold features, then all Round 2 modeling steps and QA.

> **Note:** Large transaction and POI files are not committed to GitHub. A full rebuild generates them locally (see [Generated files](#generated-files-not-in-this-repo)).

### What `run_round2_pipeline.py` runs

**Default** (`python src/run_round2_pipeline.py`):

| Step | Script | Purpose |
|------|--------|---------|
| 1 | `phase3_gold_features.py` | Exponential POI decay + competitor density features |
| 2 | `phase4_aggregate.py` | Per-outlet historical statistics |
| 3 | `phase4_model.py` | K-Means lookalike ceilings (K=50) |
| 4 | `phase4_quantile.py` | Quantile regression ceiling (τ=0.90) |
| 5 | `phase4_predict.py` | Ensemble + competition adjustment → `predictions_final.csv` |
| 6 | `phase4_validate.py` | Backtest and sanity checks |
| 7 | `phase4_optimize.py` | LKR 5M Western Province budget LP |
| 8 | `phase5_submit.py` | Write submission CSVs |
| 9 | `phase6_export_app_data.py` | Export JSON for web app (incl. `outlets.json`) |
| 10 | `validate_xai_samples.py` | XAI template factuality (20/20) |
| 11 | `validate_xai_llm.py` | Optional live Ollama/Gemini spot-check |
| 12 | `audit_all.py` | Master QA (**327 checks**, target 0 FAIL) |

**With `--full`:** prepends bronze ingest, phase 1 forensics/profile, silver clean, POI acquire, POI synthetic, then the table above.

**Flags:**

```bash
python src/run_round2_pipeline.py --skip-audit   # pipeline only, no audit_all
python src/verify_all.py                         # re-run Python QA without full pipeline
```

### Manual pipeline (same steps, one script at a time)

If you prefer to run phases individually (equivalent to Option A + QA):

```bash
python src/phase3_gold_features.py
python src/phase4_aggregate.py
python src/phase4_model.py
python src/phase4_quantile.py
python src/phase4_predict.py
python src/phase4_validate.py
python src/phase4_optimize.py
python src/phase5_submit.py
python src/phase6_export_app_data.py
python src/validate_xai_samples.py
python src/audit_all.py
```

For a **full** manual rebuild, run these first:

```bash
python src/ingest_manifest.py
python src/phase1_forensics.py
python src/phase1_profile_enhanced.py
python src/phase2_silver.py
python src/phase3_poi_acquire.py      # internet; or skip if using cached/synthetic POI
python src/phase3_poi_synthetic.py
python src/phase3_gold_features.py
# … then continue with phase4_aggregate.py onward (list above)
```

---

## Run the web app

The pipeline must finish **before** starting the app (step 9 above creates the local outlet export).

```bash
cd app
npm install
npm run build:clean
npm run start
```

Open **http://localhost:3000**

- **Browse** all 20,000 outlet predictions (paginated table + map)
- **Filter** by province and/or distributor
- **Drill down** into an outlet for ceilings, feature drivers, and “Explain this outlet” (Ollama → Gemini → template)

See [`app/README.md`](app/README.md) for XAI configuration and troubleshooting.

**Development:** `npm run dev:clean` — do not mix `dev` and `start` on the same `.next` cache.

---

## Generated files (not in this repo)

Some outputs are **required to run the project locally** but are **not committed to GitHub** — they are too large, contain competition source data, or are local-only working copies. After cloning, generate them with the pipeline scripts below.

| File | Size (approx.) | Required for | How to generate |
|------|----------------|--------------|-----------------|
| `app/public/data/outlets.json` | ~40 MB | **Web app** — browse/filter/drill-down all 20,000 outlets | `python src/phase6_export_app_data.py` (included in `run_round2_pipeline.py`) |
| Competition source bundle | varies | Full rebuild from raw data (`--full` pipeline) | Place organizer CSVs in `datastorm-7-0-rotaract/` per competition instructions, then `python src/run_round2_pipeline.py --full` |
| `gold/features/poi_normalized.csv` | large | POI feature rebuild | `python src/phase3_gold_features.py` (after POI acquire/synthetic) |
| Large transaction CSVs under `bronze/` / `silver/` | large | Full transaction re-ingest | `python src/run_round2_pipeline.py --full` |

**Web app (`outlets.json`):** The UI fetches `/data/outlets.json` at startup. Without it, the home page shows an error. Smaller bundles in `app/public/data/` (`export_manifest.json`, `western_budget.json`, `optimization_summary.json`) *are* in the repo, but the full outlet export is not — regenerate after clone or whenever predictions change:

```bash
# From project root (after phase4_predict + phase4_optimize have run):
python src/phase6_export_app_data.py
```

Then start the app ([Run the web app](#run-the-web-app)). A fresh clone should run [Option A](#option-a--standard-run-recommended-after-clone) once; that runs phase6 automatically.

**Final submission files (upload to Google Form):**
- `submissions/StackKings_predictions.csv` — latent potential (20,000 outlets)
- `submissions/StackKings_budget_allocations.csv` — Western Province trade spend

**Main notebook:** `notebooks/datastorm7_solution.ipynb`

**Documentation:** [`docs/Mathematical_Framework.md`](docs/Mathematical_Framework.md) — equations and constants used in the pipeline.

---

## Repository structure

```
.
├── bronze/raw/                  # Immutable copies with SHA-256 manifest
├── silver/
│   ├── clean/                   # 5 cleaned datasets
│   └── quarantine/              # 5 quarantine files (37,205 rejected records)
├── gold/
│   ├── features/
│   │   ├── outlet_features.csv  # 20,000 × 40 Gold feature table
│   │   ├── outlet_stats.csv     # Per-outlet historical statistics
│   │   └── coord_quality.csv    # Coordinate audit (200 swapped, 40 zeros)
│   └── predictions/
│       ├── predictions_final.csv
│       └── predictions_raw.csv
├── submissions/
│   ├── StackKings_predictions.csv
│   └── StackKings_budget_allocations.csv
├── notebooks/
│   └── datastorm7_solution.ipynb
├── metadata/
│   ├── ingestion_manifest.csv   # SHA-256, rows, timestamps
│   ├── schema.yml               # Expected types, PKs, required fields
│   ├── forensics_report.csv     # All artifacts found in source data
│   ├── transactions_profile_full.csv
│   ├── silver_audit.csv         # DE check counts & failure reasons
│   ├── clustering_report.csv    # K-Means cluster summary
│   ├── validation_report.csv    # Per-outlet validation flags
│   └── validation_summary.txt  # Human-readable validation summary
├── src/                         # All pipeline scripts
│   ├── ingest_manifest.py
│   ├── phase1_forensics.py
│   ├── phase1_profile_enhanced.py
│   ├── de_checks.py             # Reusable DE check library
│   ├── phase2_silver.py
│   ├── phase3_poi_acquire.py    # Production Overpass scraper
│   ├── phase3_poi_synthetic.py  # Offline fallback
│   ├── phase3_gold_features.py
│   ├── phase4_aggregate.py
│   ├── phase4_model.py
│   ├── phase4_quantile.py
│   ├── phase4_predict.py          # Round 2: ensemble + competition adjustment
│   ├── phase4_optimize.py         # Round 2: LKR 5M budget optimizer
│   ├── phase4_validate.py
│   ├── phase5_submit.py
│   ├── phase6_export_app_data.py  # Round 2: app data bundle
│   ├── spatial_decay.py           # Round 2: exponential POI decay
│   ├── spatial_competition.py     # Round 2: competitor density + DBSCAN
│   ├── validate_xai_samples.py
│   ├── validate_xai_llm.py
│   ├── verify_submission.py
│   ├── verify_all.py              # Master QA (327 checks)
│   ├── summarize_decay_beta.py
│   ├── run_round2_pipeline.py   # Workstream 5: one-command pipeline + audit
│   ├── phase5_generate_notebook.py
│   └── audit_all.py             # Master QA audit (incl. Workstream 5 checks)
├── app/                         # Round 2: Outlet Intelligence Web App (Next.js + Tailwind)
│   ├── app/                     # App Router pages + XAI API
│   ├── components/              # UI + FilterBar, OutletsTable, OutletMap, …
│   └── public/data/             # JSON bundles (see “Generated files” — outlets export is local-only)
├── docs/
│   └── Mathematical_Framework.md
├── genai_transparency_log.md
└── README.md
```

---

## Solution Summary

### Problem
Estimate `Maximum_Monthly_Liters` (latent purchase potential) for 20,000 FMCG retail outlets
for January 2026. Observed historical volumes are right-censored — supply constraints prevent
outlets from purchasing up to true demand.

### Data Issues Found
| Issue | Count |
|---|---|
| Duplicate transaction PKs | 32,240 |
| Negative volume records | 4,753 |
| Blackout outlets (no Dec 2025) | 7,417 |
| Swapped lat/lon coordinates | 200 |
| Zero-coordinate outlets | 40 |
| Outlet type typos (`Grocry`, `Bakry`, etc.) | 785 fixed |

### Methodology

**Pipeline:** Bronze → Silver → Gold → Predictions

1. **Right-censoring treatment:** Observed volumes are treated as lower bounds; the model
   estimates the true ceiling rather than the observed mean.

2. **Lookalike Cluster Ceilings (K-Means, K=50):**
   - Group outlets by volume profile + outlet attributes + POI density
   - Within each cluster, take the 90th percentile of historical maximum volumes
   - This is the "unconstrained reference" — what peer outlets with fewer supply constraints have achieved

3. **January seasonality adjustment:**
   - Use outlet-specific January historical average if available (3 years of data)
   - Fall back to distributor-level seasonality label (Favorable / Moderate / Un-Favorable)

4. **Prediction formula:**
   ```
   prediction = max(base_ceiling × jan_factor, own_max, 1.0)
   ```
   The `own_max` floor ensures predictions are never below observed history.

### Methodology (Round 2)

**Pipeline:** Bronze → Silver → Gold → Predictions → Optimization → Web App

1. **Exponential distance-decay POI features:** `influence = Σ exp(-β·d)` replaces flat radius counts (β per category in `src/spatial_decay.py`; run `python src/summarize_decay_beta.py` for sensitivity tables in `metadata/decay_beta_sensitivity.csv`)
2. **Competitive catchment density:** outlet-to-outlet spatial index, DBSCAN zones, saturation labels
3. **Ensemble prediction:** `max(K-Means ceiling, QR τ=0.90)` with competition adjustment
4. **LKR 5M optimization:** diminishing-returns LP for Western Province trade spend
5. **Hybrid XAI:** Ollama → Gemini → template in web app (Tailwind UI in `app/`)

### Key Results (Round 2)
| Metric | Value |
|---|---|
| Total predictions | 20,000 |
| Median prediction | ~290 L/month |
| Backtest coverage | 100% |
| Western Province budget allocated | LKR 5.00M / 5M (100% utilization) |
| Incremental liters (optimizer) | ~1,004,555 L |
| Optimizer lift vs naive equal-split baseline | ~253% |
| XAI validation | 20/20 samples pass |
| Master audit | 327 PASS / 0 FAIL |

---

## Dependencies

**Python pipeline**

```
Python 3.11+
numpy >= 2.0
scipy >= 1.17
requests >= 2.28   (Overpass POI acquire; optional if using synthetic/cached POI)
```

**Web app** (`app/`): Node.js 18+, npm. See `app/package.json`.

No other Python packages required. DE checks and modeling use stdlib + numpy + scipy.

---

## GenAI Disclosure

See `genai_transparency_log.md` for full disclosure of AI assistance used in this project.
