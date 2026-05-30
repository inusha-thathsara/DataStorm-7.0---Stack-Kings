# Stack Kings — Outlet Intelligence Web App

## Setup (judges / demo)

From the project root, export app data if you have not run the full pipeline yet:

```bash
python src/phase6_export_app_data.py
```

(`run_round2_pipeline.py` runs this step automatically.)

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

Copy `.env.example` to `.env.local` and configure any combination:

| Variable | Purpose |
|----------|---------|
| `OLLAMA_ENABLED=true` | Try local Ollama first (requires Ollama **0.20+**) |
| `OLLAMA_BASE_URL` | Ollama host (default `http://127.0.0.1:11434`) |
| `OLLAMA_MODEL` | Model tag (default `gemma4:e4b` — Gemma 4 Effective 4B) |

Pull the model once:

```bash
ollama pull gemma4:e4b
```

| `GEMINI_API_KEY` | Cloud fallback via Gemini 2.0 Flash (`GEMINI_MODEL` optional) |

**Resolution order:** Ollama (local) → Gemini (API) → deterministic template.

Without Ollama or Gemini, the template fallback always works offline.

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
2. **Ollama + `gemma4:e4b`:** the app sends `think: false` so the model returns text in `content` (otherwise thinking can use all tokens and leave `content` empty).
3. **Gemini:** default model is `gemini-2.0-flash` (`gemini-1.5-flash` often returns 404). Use an [AI Studio](https://aistudio.google.com/apikey) API key. HTTP **429** = quota/rate limit — wait and retry.
4. Confirm Ollama: `ollama list` shows `gemma4:e4b`, and `ollama serve` is running.

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
