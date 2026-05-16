## Plan: Data Storm 7.0 Pipeline & Modeling

TL;DR - Build a defensible Bronze → Silver → Gold pipeline around messy, censored FMCG data; add POI enrichment; estimate latent January 2026 outlet potential with censored-aware modeling plus lookalike benchmarking; deliver predictions, codebase, and a 5‑page report aligned to judging criteria.

**Implementation Kickoff (first 2 hours)**
- Treat the dataset folder as read-only; never edit files in datastorm-7-0-rotaract.
- Create directories: bronze/raw, silver/clean, silver/quarantine, gold/features, metadata, src, notebooks.
- Create metadata/ingestion_manifest.csv with: source_file, ingested_at, sha256, rows, columns.
- Create metadata/schema.yml with expected types, primary keys, and required fields per dataset.
- Profile transactions_history_final.csv (chunked read) and log nulls, ranges, and obvious anomalies.
- Record the known header for transactions_history_final.csv: Outlet_ID,Year,Month,Distributor_ID,SKU_ID,Volume_Liters,Total_Bill_Value.


**Steps**
1. Phase 1 — Scope & Data Forensics (*start immediately*): inventory all provided datasets, confirm schema consistency, and list known artifacts (ghost entries, typos, blackouts, duplicates). Define mandatory fields and primary keys per dataset. *blocks later checks*
2. Phase 1 — Bronze ingestion: copy raw files into a `bronze/` layer and create a lightweight manifest (source, timestamp, file hash) to preserve raw provenance. *depends on 1*
3. Phase 1 — Profiling: profile `transactions_history_final.csv` with chunked reads (Polars/DuckDB) to map nulls, ranges, duplicates, and anomalous patterns by outlet/distributor/time. *depends on 2*
4. Phase 2 — Reusable DE checks: implement parameterizable checks (duplicate, null, referential integrity, range, format/type) and apply to each dataset. Capture failures with reason codes. *depends on 1–3*
5. Phase 2 — Silver cleaning & quarantine: produce cleaned datasets plus quarantined records store; log transforms and counts; preserve rejected records and reasons. *depends on 4*
6. Phase 3 — POI acquisition: use OSM/Overpass to gather POIs (schools, bus stands, hospitals, markets, tourist attractions) within province-level bounding boxes; store raw POI snapshots and normalize categories. *parallel with step 5*
7. Phase 3 — Gold enrichment: join POI features to outlets (counts within radius, nearest distance), add seasonality encodings from distributor data and holiday flags. *depends on 5 & 6*
8. Phase 4 — Modeling latent potential: treat observed volumes as right‑censored; prototype quantile regression/Tobit/survival methods and a lookalike‑benchmark ceiling (top decile within cluster). Combine into a defensible ceiling estimate for January 2026. *depends on 7*
9. Phase 4 — Validation & sanity checks: backtest with historical months, verify monotonic sanity (no negative predictions, reasonable uplift), and review top‑potential outlets for face validity. *depends on 8*
10. Phase 5 — Deliverables: generate final predictions (Outlet_ID, Maximum_Monthly_Liters), prepare README instructions, and write the 5‑page report with data forensics, POI method, causal logic, and GenAI transparency log. *depends on 9*

**Relevant files**
- [datastorm-7-0-rotaract/transactions_history_final.csv](datastorm-7-0-rotaract/transactions_history_final.csv) — primary censored sales history
- [datastorm-7-0-rotaract/outlet_master.csv](datastorm-7-0-rotaract/outlet_master.csv) — outlet attributes
- [datastorm-7-0-rotaract/outlet_coordinates.csv](datastorm-7-0-rotaract/outlet_coordinates.csv) — outlet latitude/longitude
- [datastorm-7-0-rotaract/distributor_seasonality_details.csv](datastorm-7-0-rotaract/distributor_seasonality_details.csv) — seasonality labels
- [datastorm-7-0-rotaract/holiday_list.csv](datastorm-7-0-rotaract/holiday_list.csv) — holiday calendar
- [datastorm-7-0-rotaract/1.%20dataset_description.xlsx](datastorm-7-0-rotaract/1.%20dataset_description.xlsx) — column descriptions
- [Data_Storm_7_Problem_Summary.txt](Data_Storm_7_Problem_Summary.txt) — official problem statement
- [guidelines.md](guidelines.md) — competition rules
- [study_plan.md](study_plan.md) — learning guide

**Verification**
1. DE-check audit table: counts before/after, reject rates, top failure reasons.
2. POI QA: sample outlets with map-based or manual sanity checks for POI proximity.
3. Modeling QA: compare predicted ceilings vs observed historical top months and cluster leaders.
4. Submission QA: validate columns, row count, and sorting against Kaggle sample format.

**Decisions & Assumptions**
- Historical volumes are right‑censored observations; potential is latent and must be inferred.
- Data is intentionally messy; forensics and quarantine are part of the evaluation, not optional.
- External POI data is required; bulk download with rate‑limit handling is expected.

**Further Considerations**
1. If the Kaggle sample submission file is unavailable locally, mirror its schema from the competition data tab before final export.
2. Province/distributor coverage should be verified against the historical data to avoid leakage or missing regions.
3. If compute is limited, prototype on a stratified subset then scale to full data.
