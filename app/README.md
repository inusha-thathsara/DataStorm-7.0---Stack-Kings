# Stack Kings — Outlet Intelligence Web App

Run the [pipeline end to end](../README.md#run-the-pipeline-end-to-end) first (`python src/run_round2_pipeline.py` from the repo root).

## Setup (judges / demo)

The web app needs a **local export** of all 20,000 outlets at `app/public/data/outlets.json` (~40 MB). That file is **not on GitHub** (size limit); you must generate it after clone.

From the project root:

```bash
python src/phase6_export_app_data.py
```

This reads `gold/predictions/predictions_final.csv` and related pipeline outputs. It is the last step in `run_round2_pipeline.py` — if you already ran the full pipeline, the file should exist locally.

```bash
cd app
npm install
npm run build:clean
npm run start
```

Open http://localhost:3000

**Development:** `npm run dev:clean` — do not run `dev` and `start` against the same `.next` folder without rebuilding.

**UI:** Tailwind CSS + shared components in `components/ui/` and `components/FilterBar.tsx`, `OutletsTable.tsx`, etc.

## Optional: Hybrid XAI (Ollama + Gemini)

Copy `.env.example` to `.env.local` and configure any combination.

**Explain this outlet** calls **Ollama directly from your browser** (not via the Next.js server), so inference runs in the Ollama process you can see in Task Manager / `ollama ps`. The UI only shows **Ollama (local LLM)** when Ollama returns `eval_count > 0` (real generated tokens).

### Ollama setup (required for local LLM)

```bash
ollama pull gemma3:1b
```

**GPU-first (recommended on Windows):** stop any running Ollama, then from the repo root:

```powershell
.\scripts\start-ollama-gpu.ps1
```

This sets `OLLAMA_NUM_GPU_LAYERS=9999`, flash attention, and CORS for the app. Each Explain request also sends `options.num_gpu=999` and `main_gpu=0` so Ollama offloads as many layers as VRAM allows.

Verify GPU usage while explaining an outlet:

```bash
ollama ps
```

You want a high **GPU** share in the `PROCESSOR` column (e.g. `20%/80% CPU/GPU` or `100% GPU`). Default model `gemma3:1b` is small (~1B params) and should fit easily in VRAM; use a larger model only if you need richer prose.

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_OLLAMA_ENABLED=true` | Browser calls Ollama at `NEXT_PUBLIC_OLLAMA_BASE_URL` |
| `NEXT_PUBLIC_OLLAMA_MODEL` | Model tag (default `gemma3:1b`) |
| `NEXT_PUBLIC_OLLAMA_TIMEOUT_MS` | Default **120000** — gemma3:1b is usually fast; increase if SWOT output truncates |
| `NEXT_PUBLIC_OLLAMA_NUM_GPU` | Default **999** — max GPU layer offload (`0` = CPU-only) |
| `GEMINI_API_KEY` | Server fallback via Gemini 2.0 Flash |

**Resolution order:** Browser Ollama → Gemini (server) → deterministic template (labeled honestly).

Without Ollama or Gemini, the template fallback always works offline and is labeled **Deterministic template (fallback)**.

### Fix “Cannot find module './276.js'” or blank server errors

Stale `.next` cache after long dev sessions or interrupted builds. **Stop the server**, then:

```bash
cd app
npm run build:clean && npm run start
# or for development:
npm run dev:clean
```

Hard refresh the browser (Ctrl+Shift+R) if needed.

### Troubleshooting XAI (template fallback only)

1. **Restart the server** after editing `.env.local` (`Ctrl+C`, then `npm run dev:clean` or rebuild + `npm run start`).
2. **Ollama + `gemma3:1b`:** browser calls `http://127.0.0.1:11434/api/chat` with `think: false`. Set `OLLAMA_ORIGINS=http://localhost:3000` and restart Ollama if the browser cannot reach it (CORS). Badge shows **token count + duration** as proof of inference. Default timeout is **120s**. Increase `OLLAMA_TIMEOUT_MS` if you still see template fallback.
3. **Gemini:** default model is `gemini-2.5-flash` (override via `GEMINI_MODEL`). Use an [AI Studio](https://aistudio.google.com/apikey) API key. HTTP **429** = quota/rate limit — wait and retry.
4. Confirm Ollama: `ollama list` shows `gemma3:1b`, and `ollama serve` is running.

Validate template factuality:

```bash
python src/validate_xai_samples.py
```

## Features (Workstream 4)

- Browse 20,000 outlet predictions (paginated table)
- Sri Lanka map pin overview (sampled; green = Western trade spend)
- Filter by province, distributor, or Western budget scope
- Drill-down: ceilings, cluster traceability, DBSCAN, decay POI, trade spend + incremental volume
- Optimization summary banner (LKR 5M Western allocator)
- Hybrid XAI: "Explain this outlet" with source badge (Ollama → Gemini → template)
