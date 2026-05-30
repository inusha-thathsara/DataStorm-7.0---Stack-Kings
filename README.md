# Data Storm 7.0 — README
**Team: Stack Kings** · **Stage:** Round 2 (2nd Round submission — Top 10 selection)

## Quick Start

```bash
# 1. Create virtual environment and install dependencies
python -m venv .venv
.venv\Scripts\pip install numpy scipy requests

# 2. Run Round 2 pipeline + QA (Workstream 5 — recommended)
python src/run_round2_pipeline.py

# Or full rebuild from bronze (first-time / data refresh):
python src/run_round2_pipeline.py --full

# 3. Start the Outlet Intelligence Web App
#    outlets.json (~40 MB) is gitignored — run phase6 if you cloned without running step 2:
#    python src/phase6_export_app_data.py
cd app && npm install && npm run build:clean && npm run start
# Open http://localhost:3000
# Dev mode: npm run dev:clean  (do not mix dev + start on same .next cache)
# Optional: OLLAMA_ENABLED / GEMINI_API_KEY in app/.env.local for LLM XAI (template fallback always works)
```

**Web app data:** `app/public/data/outlets.json` holds all outlet predictions for the UI. It is listed in `.gitignore` (~40 MB). Generate it with `python src/phase6_export_app_data.py` (included in `run_round2_pipeline.py`). See [`app/README.md`](app/README.md).

### Manual pipeline (same steps as `run_round2_pipeline.py`)

```bash
python src/phase3_gold_features.py      # decay POI + competitor density
python src/phase4_aggregate.py
python src/phase4_model.py
python src/phase4_quantile.py
python src/phase4_predict.py          # ensemble + competition adjustment
python src/phase4_validate.py
python src/phase4_optimize.py           # LKR 5M Western Province allocation
python src/phase5_submit.py
python src/phase6_export_app_data.py    # app/public/data/outlets.json (~40 MB, gitignored) + export_manifest.json
python src/validate_xai_samples.py
python src/audit_all.py                 # target: 0 FAIL
```

See [`docs/pipeline_qa.md`](docs/pipeline_qa.md) and run `python src/verify_all.py` before submitting.

**Google Form uploads:** see [`docs/SUBMISSION.md`](docs/SUBMISSION.md) (CSVs, zip/GitHub, two PDFs — no video field).

**Final submission files:**
- `submissions/StackKings_predictions.csv` — latent potential (20,000 outlets)
- `submissions/StackKings_budget_allocations.csv` — Western Province trade spend
- `submissions/submission.csv` — alias of predictions file

**Main notebook:** `notebooks/datastorm7_solution.ipynb`

### Round 2 deliverables (Workstream 6)

| Item | Source (export PDF / upload per form) |
|------|----------------------------------------|
| Technical paper | [`docs/StackKings_Technical_Paper.md`](docs/StackKings_Technical_Paper.md) → PDF |
| Mathematical framework | [`docs/Mathematical_Framework.md`](docs/Mathematical_Framework.md) (equations & constants) |
| Pitch deck | [`docs/pitch_deck.md`](docs/pitch_deck.md) → PDF |
| Speaker notes | [`docs/pitch_speaker_notes.md`](docs/pitch_speaker_notes.md) |
| Live demo script | [`docs/demo_script.md`](docs/demo_script.md) (rehearsal if presenting live) |
| Submission guide | [`docs/SUBMISSION.md`](docs/SUBMISSION.md) |
| Checklist | [`docs/workstream6_checklist.md`](docs/workstream6_checklist.md) |

---

## Repository Structure

```
Datastorm/
├── datastorm-7-0-rotaract/     # READ-ONLY source data (never modified)
│   ├── transactions_history_final.csv
│   ├── outlet_master.csv
│   ├── outlet_coordinates.csv
│   ├── distributor_seasonality_details.csv
│   ├── holiday_list.csv
│   └── 1. dataset_description.xlsx
│
├── bronze/raw/                  # Immutable copies with SHA-256 manifest
├── silver/
│   ├── clean/                   # 5 cleaned datasets
│   └── quarantine/              # 5 quarantine files (37,205 rejected records)
├── gold/
│   ├── features/
│   │   ├── poi_normalized.csv   # 44,000 POIs (7 categories)
│   │   ├── outlet_features.csv  # 20,000 × 40 Gold feature table
│   │   ├── outlet_stats.csv     # Per-outlet historical statistics
│   │   └── coord_quality.csv    # Coordinate audit (200 swapped, 40 zeros)
│   └── predictions/
│       └── predictions_raw.csv  # Full predictions with traceability columns
├── submissions/
│   └── submission.csv           # FINAL KAGGLE SUBMISSION
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
│   └── public/data/             # outlets.json + export_manifest.json
├── docs/
│   ├── StackKings_Technical_Paper.md  # WS6: export to PDF (≤10 pages)
│   ├── pitch_deck.md                  # WS6: export to PDF (≤10 slides)
│   ├── pitch_speaker_notes.md         # WS6: 10-min pitch script
│   ├── demo_script.md                 # WS6: 5-min live demo + Q&A
│   ├── SUBMISSION.md                  # WS6: zip + PDF export guide
│   ├── workstream6_checklist.md       # WS6: completion checklist
│   └── pipeline_qa.md                 # Workstream 5 QA checklist
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

1. **Exponential distance-decay POI features:** `influence = Σ exp(-β·d)` replaces flat radius counts (β per category in `src/spatial_decay.py`; sensitivity in `docs/StackKings_Technical_Paper.md` §1.5, `python src/summarize_decay_beta.py`)
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

```
Python 3.11+
numpy >= 2.0
scipy >= 1.17
requests >= 2.28   (for Overpass API; not needed if using synthetic fallback)
```

No other third-party packages required. All DE checks and modeling use stdlib + numpy + scipy.

---

## GenAI Disclosure

See `genai_transparency_log.md` for full disclosure of AI assistance used in this project.
