# Stack Kings — Outlet Intelligence Web App

Run the [pipeline end to end](../README.md#run-the-pipeline-end-to-end) first (`python src/run_round2_pipeline.py` from the repo root).

**Live production:** https://stackkings.inusha.me  
**Standalone app repo:** https://github.com/inusha-thathsara/Stack-Kings-Outlet-Intelligence

## Setup (judges / demo)

For **local development without Postgres**, generate a **local export** of all 20,000 outlets at `app/public/data/outlets.json` (~40 MB). That file is **not on GitHub** (size limit).

From the project root:

```bash
python src/phase6_export_app_data.py
```

This reads `gold/predictions/predictions_final.csv` and related pipeline outputs. It is the last step in `run_round2_pipeline.py`.

```bash
cd app
npm install
npm run build:clean
npm run start
```

Open http://localhost:3000

**Development:** `npm run dev:clean` — do not run `dev` and `start` against the same `.next` folder without rebuilding.

**Production:** Set `DATABASE_URL` (Neon Postgres) in Vercel; apply `lib/db/schema.sql`. The app serves paginated `/api/outlets/*` — no 40 MB client download.

## Features

### Browse & filter
- Paginated table of 20,000 outlet predictions (default sort: **outlet ID ascending**)
- Sort by gap, predicted liters, or trade spend; direction asc/desc
- Filter by province, distributor, Western budget scope, high saturation, and outlets with trade spend
- Quick filters and **saved filter presets** (browser localStorage)
- URL-synced filter/sort state — copy the address bar to share a view
- Sri Lanka map overview (sampled pins; green = Western trade spend)
- Optimization summary banner (LKR 5M Western allocator)

### Outlet detail
- Ceilings (K-Means + QR), competition/DBSCAN, exponential POI decay, trade spend + incremental volume
- Recharts: potential volume bar chart and QR feature-importance chart
- **Explain this outlet:** structured JSON → SWOT quadrants + business summary
- SWOT bullets **cross-link** to chart metrics and top QR drivers (click to highlight)
- **Share:** copy link, export Markdown (when summary exists), print / save PDF

### Compare two outlets
- Select up to two outlets from the browse table (checkboxes + **Compare outlets** bar), or open `/compare?a=OUT_xxx&b=OUT_yyy`
- Side-by-side metrics, volume charts, and top drivers
- **Change either outlet** via searchable ID picker in the header or each column (outlet IDs only — no “Outlet A/B” labels)

### Data plane
| Mode | When | How |
|------|------|-----|
| **Postgres** | `DATABASE_URL` set (production) | `/api/outlets`, `/api/outlets/map`, `/api/outlets/stats`, `/api/outlets/[id]` |
| **JSON fallback** | No DB or transient DB errors (dev) | `public/data/outlets.json` via same API layer |

Apply `lib/db/schema.sql` on Neon for production (includes `outlet_explanations` explain cache).

### Tests
```bash
cd app
npm test    # vitest — explainSchema repair/normalize unit tests
```

## Hybrid XAI (Ollama + Gemini)

Copy `.env.example` to `.env.local` and configure any combination.

**Explain this outlet** returns a **structured explanation**: SWOT (strengths, weaknesses, opportunities, threats) plus a business summary. The LLM outputs JSON (repaired/normalized in `lib/explainSchema.ts`); empty quadrants merge from a deterministic template.

**Resolution order:** Browser Ollama → Gemini (server `/api/explain`) → deterministic template (labeled honestly). Successful explanations can be **cached** in Postgres (`outlet_explanations`) when `DATABASE_URL` is set.

Browser Ollama runs in your local Ollama process (Task Manager / `ollama ps`). The UI shows **Ollama (local LLM)** only when Ollama returns `eval_count > 0`.

### Ollama setup (local LLM)

```bash
ollama pull gemma3:1b
```

**GPU-first (Windows):** from repo root:

```powershell
.\scripts\start-ollama-gpu.ps1
```

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_OLLAMA_ENABLED=true` | Browser calls Ollama at `NEXT_PUBLIC_OLLAMA_BASE_URL` |
| `NEXT_PUBLIC_OLLAMA_MODEL` | Model tag (default `gemma3:1b`) |
| `NEXT_PUBLIC_OLLAMA_TIMEOUT_MS` | Default **120000** — increase if SWOT truncates |
| `NEXT_PUBLIC_OLLAMA_NUM_GPU` | Default **999** — max GPU layer offload (`0` = CPU-only) |
| `GEMINI_API_KEY` | Server fallback (`gemini-2.5-flash` default) |
| `DATABASE_URL` | Optional Neon Postgres for production API + explain cache |

Without Ollama or Gemini, the template fallback always works offline and is labeled **Deterministic template (fallback)**.

### Fix “Cannot find module './276.js'” or blank server errors

Stale `.next` cache. **Stop the server**, then:

```bash
cd app
npm run build:clean && npm run start
# or: npm run dev:clean
```

### Troubleshooting XAI

1. Restart the server after editing `.env.local`.
2. **Ollama:** set `OLLAMA_ORIGINS=http://localhost:3000` for CORS; confirm `ollama list` shows `gemma3:1b`.
3. **Gemini:** [AI Studio](https://aistudio.google.com/apikey) key; HTTP **429** = rate limit.
4. Validate template factuality: `python src/validate_xai_samples.py` from repo root.
