# Stack Kings — Judging Panel Pitch Script (< 10 minutes)

**Team:** Stack Kings · **Competition:** Data Storm 7.0 · Round 2  
**Live app:** https://stackkings.inusha.me  
**Total target:** ~8:30 spoken + ~1:00 live demo handoff (leave buffer for one question)

---

## Three-member team split (~3 minutes each)

Assign roles by strength — suggested layout below. Replace **[Name 1/2/3]** with your names.

| Speaker | Role | Slides | Time | Sections |
|---------|------|--------|------|----------|
| **Member 1** | Business narrative | 1–2 | ~2:45 | Opening → Problem → Solution |
| **Member 2** | Modeling & impact | 3–6 | ~3:00 | Latent demand → Spatial → Optimizer & ROI |
| **Member 3** | Demo & close | 7–10 | ~3:15 | Live app → Credibility → Thank you |

**Standing order:** Member 1 center (opens) → Member 2 (methodology) → Member 3 at laptop (demo). All three visible for Q&A at the end.

---

### Member 1 — Business & problem (~2:45)

*[Slides 1–2 · You open the pitch]*

**Say:**

> Good [morning/afternoon], judges. We are **Stack Kings** — **[Name 1]**, **[Name 2]**, and **[Name 3]** — and we built an **Outlet Intelligence platform** for Data Storm 7.0 Round 2.

> Imagine two shops on the same street. One is busy but chronically understocked — invoices show low liters, not low demand. The other is already at capacity — more coolers won't help. If you allocate trade spend using **historical sales alone**, you fund the past, not the future.

> Our thesis: **"We're funding history, not potential."**

> Sri Lankan outlet data shows **what was delivered**, not **what could have been sold** — **right-censoring**. Sales teams don't see latent ceiling, saturation, or spatial drivers in one place. Budget goes to habit, not headroom.

> We fixed that with a full stack: a **medallion pipeline**, two submission CSVs, and a **field-facing web app** at **stackkings.inusha.me**.

> Our engine is **Potential-Based Allocation**: Bronze → Silver → Gold → model **20,000 outlets** → optimize **LKR 5 million** Western spend → explain every decision.

**Handoff (look at Member 2):**

> **[Name 2]** will walk you through how we estimate latent demand, add spatial intelligence, and optimize the budget.

---

### Member 2 — Modeling & business impact (~3:00)

*[Slides 3–6 · Advance slides as you speak]*

**Say:**

> Thanks, **[Name 1]**. How do we estimate potential without inventing numbers?

> We treat each outlet's historical max as a **floor**, then apply **two methods** and take the stronger signal: **K-Means lookalike ceilings** — what unconstrained peers achieve — and **quantile regression** at the 90th percentile for the feature-driven upper tail.

> We ensemble these, adjust for **competition** — saturation penalty in dense clusters, isolation boost outstation — and enforce: **prediction never below own historical max**. Result: **100% backtest coverage**, **median 1.26× uplift** over historical max.

> Volume is not flat across geography. A bus stop **20 meters** away beats one **400 meters** away. We use **exponential POI decay** — schools, markets, transport — not flat radius counts. **DBSCAN** and catchment density make recommendations **local and defensible**.

> For Round 2: **LKR 5 million**, January, **~9,000 Western outlets**, three distributors. Our **piecewise LP optimizer** maximizes **incremental liters** on diminishing-returns curves — not equal splits on a ranking.

> Impact: **~1.00 million incremental liters**, **~201 liters per LKR 1,000**, **+253% lift** vs naive top-500 equal split, **100% budget utilized**. Balanced across **DIST_W_01**, **W_02**, and **W_03** at roughly **1.67M / 1.66M / 1.68M** — auditable in our optimization report.

**Handoff (gesture to screen / Member 3):**

> **[Name 3]** will show you the live app a sales rep would use in the field.

---

### Member 3 — Live demo, credibility & close (~3:15)

*[Slide 7 · Open https://stackkings.inusha.me · You drive the laptop]*

**Demo (~2:00):**

> This is live at **stackkings.inusha.me** — not a mockup.

> **[Point at banner]** Optimization summary: budget, incremental liters, ROI, lift vs baseline.

> **[Point at table]** All **20,000 outlets** — predicted liters, max, **gap**, trade spend.

> **[Filter → Western]** Western Province — **~9,000 outlets**, our budget scope. Optional: filter by **distributor** for route planning.

> **[Click pre-selected high-gap outlet]** Drill-down: potential, gap, both ceiling methods, competition, POI decay, **trade spend and incremental liters** — one screen answers *how much* and *why*.

> **[Click Explain this outlet]** **Explain this outlet** uses hybrid XAI — **Gemini** on our cloud deploy, **Ollama** locally, **template** offline. The LLM **never generates predictions** — only narrates pipeline numbers. Source badge + **GenAI transparency log** for audit.

> **[Read 1–2 sentences of explanation if loaded]**

**Credibility & close (~1:15) · Slides 8–10:**

> Enterprise-grade: **37,000+ quarantined rows** with reason codes, **327 automated QA checks — zero failures**, full reproducibility via `run_round2_pipeline.py`.

> Deliverables: **StackKings_predictions.csv** and **StackKings_budget_allocations.csv**, connected to the field through this app. **Next step:** pilot Western distributors, then national scale.

> From latent demand → allocated rupees → explainable decisions. **Stack Kings** — thank you. We are happy to take your questions.

*[All three step forward for Q&A]*

---

### Q&A — who answers what

| Topic | Best speaker |
|-------|----------------|
| Business problem, ROI, rollout | Member 1 |
| K-Means, QR, spatial, optimizer math | Member 2 |
| App, Explain/XAI, live demo issues | Member 3 |
| Reproducibility, QA, GenAI log | Member 2 or 3 |
| "Walk us through one more outlet" | Member 3 (laptop ready) |

---

### Rehearsal tips for three speakers

1. **Practice handoffs aloud** — awkward pauses cost time; agree exact names and lines.
2. **One clicker** — Member 2 advances slides 3–6; Member 3 takes over at slide 7.
3. **Member 3 opens the URL before pitch starts** (tab ready, Western filter pre-applied).
4. **If someone runs long**, skip map scroll and distributor filter — keep drill-down + Explain.
5. **All three** memorize the **numbers cheat sheet** below — any member may get a metric question.

---

## How to use this script

- Speak naturally — do not read equations or code aloud.
- Numbers below are from your submission; keep them consistent.
- **Bold** = emphasis · *[stage direction]* = action on screen · > blockquote = suggested wording

---

## 0:00–0:45 · Opening

*[Stand center. Slide 1 or title card: Stack Kings — Outlet Intelligence]*

> Good [morning/afternoon], judges. We are **Stack Kings**, and we built an **Outlet Intelligence platform** for Data Storm 7.0 Round 2.

> Imagine two shops on the same street. One is busy but chronically understocked — invoices show low liters, not low demand. The other is already at capacity — more coolers won't help. If you allocate trade spend using **historical sales alone**, you fund the past, not the future.

> Our one-line thesis: **"We're funding history, not potential."**

> Stack Kings answers a practical question for FMCG trade marketing: *Where is the uncaptured volume — and where should the next rupee go?*

---

## 0:45–1:45 · The Problem

*[Slide 1 — The Problem]*

> Sri Lankan outlet data shows **what was delivered**, not **what could have been sold**. That is classic **right-censoring**: observed volume is a **lower bound** on true demand.

> Sales teams see transaction history. They do not see latent ceiling, competitive saturation, or spatial footfall drivers in one place. So coolers and LKR trade spend get spread by habit — equal splits, top sellers by last month, gut feel.

> The business cost is real: **high-potential outlets stay under-funded**, while saturated outlets absorb budget that will not move incremental volume.

> We set out to fix that with a full stack — not just a model in a notebook, but **decision-ready outputs** and a **field-facing web app**.

---

## 1:45–2:45 · Our Solution (Architecture)

*[Slide 2 — Our Solution]*

> Our solution is **Potential-Based Allocation**.

> We built an end-to-end **medallion pipeline** — Bronze, Silver, Gold — that ingests competition data, quarantines bad rows with reason codes, engineers spatial features, estimates **January 2026 maximum monthly potential** for **20,000 outlets**, and runs a **piecewise linear optimizer** on **LKR 5 million** of Western Province trade spend.

> The output is not only two submission CSVs. It is also this: **[gesture to screen / mention URL]** our **Outlet Intelligence web app** at **stackkings.inusha.me** — what a trade manager or sales rep would actually use in the field.

> Three layers, one story: **estimate potential → allocate budget → explain the decision.**

---

## 2:45–4:15 · Unmasking Latent Demand

*[Slide 3 — Unmasking Latent Demand]*

> How do we estimate potential without inventing numbers?

> First, we treat each outlet's historical maximum as a **floor**, not a ceiling. Then we apply **two independent methods** and take the **stronger defensible signal**:

> **One:** **Lookalike cluster ceilings** — K-Means on behavioral features. We ask: *what do unconstrained peer outlets in the same segment achieve?*

> **Two:** **Quantile regression** at the 90th percentile — a feature-driven upper tail driven by POI decay, seasonality, and outlet attributes.

> We ensemble these, apply a **competition adjustment** for market saturation versus isolation, and enforce a hard rule: **prediction never falls below the outlet's own historical maximum.**

> Validation: **100% backtest coverage** — every outlet's prediction is at or above its historical max — with a **median uplift of 1.26×** over that max. We are not hallucinating upside; we are **lifting the floor to a modeled ceiling**.

---

## 4:15–5:15 · Spatial Intelligence

*[Slide 4 — Spatial Intelligence]*

> Volume is not flat across geography. A bus stop **20 meters** away matters more than one **400 meters** away.

> We use **exponential distance decay** from points of interest — schools, markets, transport, worship — not naive "count everything within 3 km" features.

> For competition, we combine **DBSCAN geographic clustering** with **competitive catchment density**. A dense Colombo cluster gets a **saturation penalty**; an isolated outstation gets an **isolation boost**. Same SKU, different micro-market — different headroom.

> Spatial intelligence is what turns a generic score into a **local, defensible recommendation**.

---

## 5:15–6:30 · Western Spend Strategy & Impact

*[Slides 5 & 6 — Western Strategy + Quantified Impact]*

> Round 2's budget challenge: **LKR 5 million**, **January 2026**, roughly **9,000 Western Province outlets**, three distributors.

> We do **not** rank by potential and split equally. That naive baseline leaves money on the table.

> Our **piecewise LP optimizer** maximizes **modeled incremental liters** on diminishing-returns response curves — every rupee tied to a segment of the curve where spend still moves volume.

> Results:

> - **~1.00 million incremental liters** for the full budget  
> - **~201 liters per LKR 1,000** spent — a CFO-friendly ROI framing  
> - **+253% lift** versus naive "top 500 by potential, equal split"  
> - **100% budget utilization**

> Distributor split is **data-driven and balanced** — roughly **LKR 1.67M**, **LKR 1.66M**, and **LKR 1.68M** across **DIST_W_01**, **DIST_W_02**, and **DIST_W_03** — auditable in our optimization report.

> This is **trade marketing as an optimization problem**, not a spreadsheet exercise.

---

## 6:30–8:00 · Live App Demo

*[Slide 7 — Outlet Intelligence App · Open https://stackkings.inusha.me]*

> Let me show you what the field team sees. This is live — not a mockup.

**Home page (~30 sec)**

> At the top: the **optimization summary** — budget, incremental liters, ROI, lift versus baseline.

> The table holds all **20,000 outlets**: predicted liters, historical max, **gap**, saturation, and Western **trade spend** where allocated.

*[Filter Province → Western]*

> A manager filters to **Western Province** — about **9,000 outlets** — the scope of the budget.

*[Optional: filter by distributor DIST_W_01]*

> They can narrow by **distributor** for route planning.

*[Scroll to map if time]*

> The map adds geographic context — **green highlights** show outlets receiving optimized trade spend.

**Drill-down (~45 sec)**

*[Click a high-gap Western outlet — pre-pick one in rehearsal]*

> One click on an outlet ID opens the full story: **predicted potential**, **own max**, **gap liters**, both ceiling methods, **competition metrics**, **POI decay breakdown**, and **trade spend with expected incremental liters**.

> This is **decision support on one screen** — how much to fund, and why this outlet.

**Explain (~45 sec)**

*[Click "Explain this outlet"]*

> Field reps press **Explain this outlet**. We use **hybrid explainable AI**: on the cloud deployment, **Gemini** narrates the numbers; locally, **Ollama** first; always a **deterministic template fallback** if APIs are unavailable.

> **Critical for judges:** the LLM **never generates predictions**. It only explains values already computed by our Python pipeline. The badge shows the source — Gemini, Ollama, or Template — documented in our **GenAI transparency log**.

*[Read the first 1–2 sentences of the explanation aloud if it loaded]*

---

## 8:00–8:45 · Credibility & Rollout

*[Slides 8 & 9 — Field Rollout + Why Stack Kings]*

> This is enterprise-grade, not a one-off notebook.

> - **37,000+ quarantined rows** with explicit reason codes — we reject with audit trail, never silent drops  
> - **`python src/audit_all.py`** — **327 automated checks, zero failures** before submission  
> - Full **reproducible pipeline**: `python src/run_round2_pipeline.py` from the monorepo  
> - **GenAI transparency log** — we disclose AI-assisted development and separate that from model predictions

> Rollout path: **monthly refresh** on new transactions → distributor spend reports → reps on tablet via the web app → expand beyond Western Province.

---

## 8:45–9:30 · Close

*[Slide 10 — Next Steps]*

> We deliver two submission files: **StackKings_predictions.csv** — latent potential for 20,000 outlets — and **StackKings_budget_allocations.csv** — Western trade spend. The app connects those outputs to **people who execute in the field**.

> **Next step:** pilot with Western distributors **DIST_W_01 through W_03**, then scale nationally with live ERP feeds.

> **Stack Kings** — from latent demand to allocated rupees to explainable decisions.

> Thank you. We are happy to take questions — or walk one more outlet live.

---

## Numbers cheat sheet (memorize)

| Metric | Value |
|--------|--------|
| Outlets scored | 20,000 |
| Western outlets | ~9,000 |
| Budget | LKR 5,000,000 |
| Modeled incremental liters | ~1,004,555 L (~1.00M L) |
| ROI | ~201 L per LKR 1,000 |
| Optimizer lift vs naive baseline | +253% |
| Median uplift vs historical max | 1.26× |
| Backtest floor | 100% at or above own max |
| QA | 327 PASS / 0 FAIL |
| Live demo URL | https://stackkings.inusha.me |

---

## Demo rehearsal checklist (day before)

- [ ] Open **stackkings.inusha.me** on venue Wi‑Fi / hotspot backup
- [ ] Pre-filter **Western**, sort by **Gap** descending
- [ ] Note one **outlet ID** (high gap, trade spend > 0)
- [ ] Click **Explain** once — confirm Gemini returns full paragraphs
- [ ] Browser zoom 100%, notifications off, full screen
- [ ] PDF deck + technical paper ready if judges ask

---

## If the panel asks…

| Question | Short answer |
|----------|----------------|
| *How is potential validated?* | Backtest floor 100%; median 1.26× uplift; face-validity checks in `phase4_validate.py` |
| *Why max of K-Means and QR?* | Peers capture local behavior; QR captures feature tail — ensemble is conservative but ambitious |
| *Why piecewise LP?* | Diminishing returns on spend; maximizes incremental liters, not rank order |
| *Did AI generate predictions?* | No. AI assisted code and explanations; predictions come from deterministic pipeline |
| *Offline / low connectivity?* | App loads static JSON; Explain falls back to template without API |
| *Can we reproduce?* | Clone monorepo, `python src/run_round2_pipeline.py`, `cd app && npm run build && npm start` |

---

**Estimated speaking time:** ~8:30 · **With demo clicks:** ~9:00 · **Buffer:** ~1:00 under the 10-minute limit
