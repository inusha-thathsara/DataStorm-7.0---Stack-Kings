# Stack Kings — 6-Minute Demo Video Script

**Competition:** Data Storm v7.0 · Round 2 · Outlet Intelligence Web Application  
**Team:** Stack Kings  
**Deadline:** 3 June, 11:59 PM  
**Submit:** https://forms.gle/kksJbAzC7zs1asZw5  
**Hard limit:** 6:00 (aim for 5:30–5:45 so you are not cut off)

---

## What to include on screen (checklist)

Record **only the browser** for most of the video; optional 10-second terminal clip at the end.

| Must show | Where in app |
|-----------|----------------|
| Team + solution name (title card or voice) | First 15 sec |
| 20,000 outlets loaded | Home page / table footer or pagination |
| Optimization summary (LKR 5M, incremental liters, lift %) | Top banner on home |
| **Browse** full outlet list | Paginated table |
| **Filter** by province (Western) | Filter bar |
| **Filter** by distributor (optional) | Filter bar |
| **Map** overview | Map section (province colors, green = trade spend) |
| **Drill-down** on one outlet | Click Outlet ID → detail page |
| Traceability (ceilings, gap, competition, decay POI, trade spend) | Detail page cards/sections |
| **Explain this outlet** + source badge (Ollama / Gemini / Template) | Detail page button |
| Decision outputs (predictions + budget CSVs) | Mention + optional folder view for 5 sec |
| How a field user would use it | Voice-over while filtering → drill-down → explain |

| Nice to have (if time) | |
|------------------------|---|
| Sort by **gap** to find high-opportunity Western outlet | Table column |
| Second outlet (saturated vs high-gap contrast) | 15 sec only |
| `python src/verify_all.py` → 327 PASS | Terminal, last 10 sec |

| Do **not** need | |
|-----------------|---|
| Full pitch deck | Separate PDF submission |
| Long equations | Point to technical paper verbally |
| Live code walkthrough | Unless you have spare seconds |

---

## Before you record (15 minutes)

1. **App running:** `npm run build:clean && npm run start` in `app/` → http://localhost:3000  
2. **`outlets.json` exists** (home loads 20,000 rows — no error banner).  
3. **XAI:** Ollama running with `gemma4:e4b` *or* Gemini key in `.env.local` *or* rely on **Template** (always works). Rehearse Explain once.  
4. **Display:** 1920×1080, browser zoom **100%**, dark notifications off.  
5. **Pre-sort:** Filter Province → **Western**, sort table by **Gap** descending so a strong demo outlet is on page 1.  
6. **Note one outlet ID** (e.g. high gap, has trade spend LKR > 0) for drill-down.  
7. **Mic test** — judges must hear you clearly.

---

## Script (timed) — total ~5:45

### 0:00–0:45 · Introduction (judges: brief intro to solution)

**On screen:** Home page already open, optimization banner visible.

**Say:**

> "Hello — we're **Stack Kings**, Data Storm 7.0 Round 2.  
> We built an **Outlet Intelligence Web Application** that turns latent demand modeling into **field-ready decisions** for twenty thousand Sri Lankan outlets.  
> Historical sales show what outlets *did* buy — not what they *could* buy. Our engine estimates **January 2026 maximum monthly potential**, then allocates **five million rupees** of Western Province trade spend to maximize **incremental volume** — not just ranking by size.  
> This app is what sales and trade marketing teams would use day to day: browse, filter, drill down, and get explainable recommendations — with every number traceable to our Python pipeline."

---

### 0:45–2:15 · Main features — browse, filter, map (judges: functionality + interaction)

**On screen:** Stay on home. Move mouse deliberately; do not rush clicks.

| Time | Action | Say (short) |
|------|--------|-------------|
| 0:45 | Point at **optimization banner** | "At the top, the **optimization summary**: full **five million rupees** deployed, about **one million incremental liters** modeled, roughly **two hundred liters per thousand rupees**, and **over two hundred fifty percent lift** versus a naive equal-split baseline." |
| 1:00 | Scroll table — show **20,000** outlets / pagination | "The table holds all **twenty thousand** outlet scores — predicted liters, historical max, **gap**, market saturation, and Western **trade spend** where allocated." |
| 1:15 | Open **Province** filter → **Western** (~9,000) | "A trade manager filters to **Western Province** — nine thousand outlets — the scope of the budget challenge." |
| 1:30 | Optional: **Distributor** → e.g. DIST_W_01 | "They can narrow further by **distributor** for route planning." |
| 1:45 | Scroll to **map** | "The map gives geographic context — provinces color-coded; **green pins** highlight outlets receiving trade spend under our optimizer." |
| 2:00 | Back to table; point **Gap**, **Predicted**, **Trade spend** columns | "Users scan by **gap** — potential minus history — to prioritize visits. **Trade spend** shows the rupee recommendation per outlet." |

**Line to hit judges' "how users interact":**

> "Interaction is simple: **filter** like a CRM, **sort** by business priority, **click** an outlet ID for the full story."

---

### 2:15–4:00 · Drill-down + traceability (judges: key outputs + decision support)

**On screen:** Click your pre-selected **high-gap Western** outlet.

| Time | Action | Say |
|------|--------|-----|
| 2:15 | Detail page loads | "On drill-down, the rep sees **predicted potential**, **own historical max**, and **gap liters** — the uncaptured opportunity." |
| 2:35 | Point **K-Means / QR ceilings**, dominant method | "We don't use a black box: **K-Means peer ceiling** and **quantile regression ceiling** are both shown; the ensemble takes the stronger signal." |
| 2:50 | Point **competitor density**, **DBSCAN zone**, **saturation** | "**Competitive catchment** matters — density, cluster zone, and saturation label adjust the ceiling for crowded vs isolated outlets." |
| 3:05 | Point **decay POI** (transport, food, worship, etc.) | "**Spatial intelligence** uses exponential decay from nearby schools, markets, transport — not flat radius counts." |
| 3:20 | Point **trade spend LKR** + **incremental liters** | "For Western outlets, **trade spend** and **expected incremental liters** tie directly to our **piecewise LP optimizer** — every rupee on the response curve." |
| 3:35 | Stay on detail — pause | "This is **decision support**: one screen answers *how much to fund* and *why this outlet*." |

---

### 4:00–5:15 · Explain (XAI) + GenAI transparency (judges: unique aspects)

**On screen:** Click **"Explain this outlet"**. Wait for text (max ~5 sec; if slow, keep talking).

**Say:**

> "Field reps can press **Explain this outlet**. We use **hybrid explainable AI**: try **local Ollama** first, then **Gemini** if configured, then a **deterministic template** — always available offline.  
> **Important:** the LLM **never generates predictions** — it only narrates numbers already computed by our Bronze-to-Gold pipeline.  
> [Read first 2 sentences of the explanation.]  
> The badge shows the source — Ollama, Gemini, or Template — for auditability, documented in our **GenAI transparency log**."

If Explain fails: click again or say *"Template fallback ensures demos never block on API keys."*

---

### 5:15–5:45 · Close — deliverables & enterprise story (judges: insights + outputs)

**On screen:** Return to home (Western filter still on) OR show `submissions/` folder for 5 seconds.

**Say:**

> "Behind the app: a reproducible **medallion pipeline** — Bronze, Silver, Gold — with **three hundred twenty-seven automated QA checks**.  
> Deliverables: **StackKings_predictions.csv** — twenty thousand latent potentials — and **StackKings_budget_allocations.csv** — Western trade spend.  
> Together, the app and CSVs connect **data engineering**, **spatial modeling**, **optimization**, and **explainability** for C-suite and field teams.  
> Thank you — **Stack Kings**, Outlet Intelligence for Data Storm 7.0."

**[END — fade out. Do not exceed 6:00.]**

---

## Optional 10-second epilogue (only if under 5:30)

Show terminal:

```bash
python src/verify_all.py
```

**Say:** "Our verification suite — three hundred twenty-seven checks, zero failures — before every submission."

---

## Numbers to memorize (use consistently)

| Metric | Value |
|--------|--------|
| Outlets | 20,000 |
| Western outlets | ~9,000 |
| Budget | LKR 5,000,000 (100% utilized) |
| Modeled incremental liters | ~1,004,555 L |
| ROI | ~201 L per LKR 1,000 |
| Optimizer lift vs naive | +253% |
| QA | 327 PASS / 0 FAIL (`audit_all.py`) |

---

## Recording tips

1. **One continuous take** is fine; light edits OK (trim dead air, add 3-sec title card).  
2. **Speak while moving the mouse** — silence feels broken on review videos.  
3. **Zoom browser** so table headers and Explain text are readable at 1080p.  
4. Export **MP4**, 1080p, under form size limits; test the Google Form once before deadline.  
5. File name example: `StackKings_DataStorm7_Round2_Demo_6min.mp4`

---

## Mapping to judging criteria

| Organizers asked for | Covered in segment |
|----------------------|-------------------|
| Brief introduction | 0:00–0:45 |
| Main features & functionality | 0:45–4:00 (table, filter, map, drill-down) |
| How users interact | Woven in 1:15–2:15 + drill-down |
| Key insights & decision support | Banner, gap, optimizer, Explain, CSVs 5:15–5:45 |

---

## Fallback if something breaks during recording

| Issue | On-camera recovery |
|-------|-------------------|
| App blank / 500 | Cut; restart `npm run build:clean && npm run start`; re-record from 0:45 |
| Explain timeout | "Template provides instant offline narrative" — click again |
| Map slow | Skip map; spend extra 20 sec on table columns |
| Wrong outlet | Use browser Back; pick another high-gap row |

Good luck with the recording.
