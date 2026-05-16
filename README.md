# Data Storm 7.0 — README
**Team: Stack Kings**

## Quick Start

```bash
# 1. Create virtual environment and install dependencies
python -m venv .venv
.venv\Scripts\pip install numpy scipy requests

# 2. Run the full pipeline
python src/ingest_manifest.py
python src/phase1_forensics.py
python src/phase1_profile_enhanced.py
python src/phase2_silver.py
python src/phase3_poi_acquire.py      # requires internet (Overpass API)
python src/phase3_poi_synthetic.py    # offline fallback if internet unavailable
python src/phase3_gold_features.py
python src/phase4_aggregate.py
python src/phase4_model.py
python src/phase4_validate.py
python src/phase5_submit.py
python src/phase5_generate_notebook.py

# 3. Run the master audit
python src/audit_all.py               # must show 163 PASS / 0 FAIL
```

**Final submission file:** `submissions/submission.csv`  
**Main notebook:** `notebooks/datastorm7_solution.ipynb`

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
│   ├── phase4_validate.py
│   ├── phase5_submit.py
│   ├── phase5_generate_notebook.py
│   └── audit_all.py             # Master QA audit
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

### Key Results
| Metric | Value |
|---|---|
| Total predictions | 20,000 |
| Median prediction | 285 L/month |
| Mean prediction | 464 L/month |
| Backtest coverage | 100% |
| Median uplift over observed max | 1.12× |
| QA status | PASS |

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
