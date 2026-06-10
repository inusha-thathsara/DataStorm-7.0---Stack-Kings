# Stack Kings — Outlet Intelligence Web App (Vercel deploy)

Next.js app for browsing 20,000 FMCG outlet predictions. This branch contains **only the web app** — no Python pipeline.

**Repository branch:** `app-deploy`  
**Full monorepo (local demo + Ollama):** `master`

## Deploy on Vercel

1. Import this repo and select the **`app-deploy`** branch.
2. Root directory: **`.`** (this branch root is the Next.js app).
3. Framework preset: **Next.js** (auto-detected).
4. Add environment variable in Vercel dashboard:
   - `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey) key for Explain XAI
   - Optional: `GEMINI_MODEL=gemini-2.5-flash`
5. Deploy.

**XAI on Vercel:** Gemini API → deterministic template fallback. Local Ollama is **not** used on this branch.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` for live Explain responses.

## Data

`public/data/outlets.json` (~38 MB) is included on this branch so the deployed app works without running the Python pipeline.

Smaller bundles: `western_budget.json`, `optimization_summary.json`, `export_manifest.json`.

## Features

- Browse 20,000 outlet predictions (paginated table + map)
- Filter by province, distributor, Western budget scope
- Drill-down: model traceability, spatial features, trade spend
- Hybrid XAI: **Gemini → template** (cloud deploy)
