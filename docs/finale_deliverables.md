# Data Storm 7.0 — Grand Finale Key Deliverables

**Team:** Stack Kings  
**Source:** *Data Storm 7.0 — Finale Guidelines.pdf*  
**Live app:** https://stackkings.inusha.me  
**Monorepo:** https://github.com/inusha-thathsara/DataStorm-7.0---Stack-Kings  
**App repo:** https://github.com/inusha-thathsara/Stack-Kings-Outlet-Intelligence

---

## Finale format (from guidelines)

| Segment | Time | Your asset |
|---------|------|------------|
| **Business + technical pitch** | **10 minutes** | `docs/finale_presentation_deck.md` + `docs/pitch_script_judging_panel.md` |
| **Live system demonstration** | **5 minutes** | https://stackkings.inusha.me |
| **Q&A** | Panel discretion | All 3 members prepared (see §Q&A below) |

**Strict time limit** — rehearse to finish under 10:00 / 5:00.

---

## Deliverable checklist

### A. Presentation deck (14 mandatory sections)

| # | PDF requirement | Stack Kings file | Status |
|---|-----------------|------------------|--------|
| 1 | Problem Statement | `docs/finale_presentation_deck.md` §1 | ✅ Content ready |
| 2 | Business Understanding | §2 | ✅ |
| 3 | Dataset Overview | §3 | ✅ |
| 4 | Data Preparation | §4 | ✅ |
| 5 | Exploratory Data Analysis | §5 | ✅ |
| 6 | Methodology | §6 | ✅ |
| 7 | Model Development | §7 | ✅ |
| 8 | Model Evaluation | §8 | ✅ |
| 9 | Key Insights | §9 | ✅ |
| 10 | Business Impact | §10 | ✅ |
| 11 | Solution Architecture | §11 | ✅ |
| 12 | Application demonstration | §12 (Next.js, not Streamlit) | ✅ |
| 13 | Future Improvements | §13 | ✅ |
| 14 | Conclusion | §14 | ✅ |

**Export to PDF:** Paste slides into PowerPoint / Google Slides / Canva → export PDF.  
**Speaker notes:** `docs/pitch_script_judging_panel.md` (3-member split included).

### B. Final business pitch

| Item | File |
|------|------|
| 10-slide executive deck (condensed) | `docs/pitch_deck.md` → PDF |
| Full spoken script (<10 min) | `docs/pitch_script_judging_panel.md` |
| Speaker cue cards | `docs/pitch_speaker_notes.md` |

**Pitch must cover (per PDF):** why the problem matters · how you solve it · value created · business feasibility · practical implementation.

### C. Working prototype

| PDF asks for | Stack Kings delivers |
|--------------|-------------------|
| Streamlit application | **Outlet Intelligence Web App** (Next.js 14) — production-deployed |
| Core functionalities | Browse 20k outlets, sort/filter/presets, map, compare two outlets, drill-down, structured SWOT Explain, export/share |
| User workflow | Trade manager → filter Western → sort by gap → drill-down or compare → Explain |
| Key outputs | Predictions CSV, budget CSV, optimization banner, per-outlet trade spend |

**Demo URL:** https://stackkings.inusha.me  
**Fallback:** Local `cd app && npm run build:clean && npm run start`

### D. Supporting technical artifacts (recommended)

| Artifact | Path |
|----------|------|
| Technical paper (≤10 pages PDF) | `docs/StackKings_Technical_Paper.md` |
| Mathematical framework | `docs/Mathematical_Framework.md` |
| GenAI transparency log | `genai_transparency_log.md` |
| Predictions submission | `submissions/StackKings_predictions.csv` |
| Budget submission | `submissions/StackKings_budget_allocations.csv` |
| Optimization evidence | `metadata/optimization_report.csv` |
| QA proof | `python src/audit_all.py` → 327 PASS / 0 FAIL |

---

## Judging criteria → where you prove it

| Criterion | Evidence in your solution |
|-----------|--------------------------|
| **Technical excellence** | Medallion pipeline, K-Means + QR ensemble, piecewise LP, 327 automated QA checks |
| **Innovation** | Right-censoring framing, exponential POI decay, hybrid XAI (LLM explains, never predicts) |
| **Business impact** | ~1.00M incremental L, ~201 L/LKR 1k, +253% vs naive baseline |
| **Prototype quality** | Live HTTPS deploy, paginated Postgres API, structured SWOT XAI with Neon cache, compare + export |
| **Presentation** | 3-member pitch script, rehearsed 5-min demo, numbers cheat sheet |

---

## 5-minute live demo script

| Time | Action | Say (short) |
|------|--------|-------------|
| 0:00 | Open **stackkings.inusha.me** — home | "Live Outlet Intelligence — 20,000 scored outlets." |
| 0:30 | Point at **optimization banner** | "LKR 5M deployed, ~1M incremental liters, +253% lift vs naive split." |
| 1:00 | **Filter → Western Province** | "~9,000 outlets — our budget scope." |
| 1:20 | Sort by **Gap** descending (not the default ID sort) | "Rep prioritizes uncaptured volume, not just size." |
| 1:30 | Optional: tick **Compare** on two rows → `/compare` | "Side-by-side gap, spend, and charts; swap outlets via ID picker." |
| 2:00 | Click high-gap outlet | Open detail page. |
| 2:30 | Detail page — ceilings, competition, POI decay | "Full traceability — not a black box." |
| 3:30 | **Explain this outlet** — SWOT + summary | "Hybrid XAI narrates pipeline numbers; LLM never generates predictions." |
| 4:15 | **Copy link** or **Print / PDF** | "Field-ready share and offline briefings." |
| 4:30 | Show **trade spend LKR** on Western outlet | "Every rupee from the piecewise LP optimizer." |
| 5:00 | Close on home or thank you | "Stack Kings — from latent demand to field-ready decisions." |

**Pre-load:** Western filter, **gap sort** (change from default ID sort), one outlet ID memorized, Wi‑Fi / phone hotspot backup.

---

## Q&A — assign to team members

| Topic | Lead speaker |
|-------|--------------|
| Business problem, ROI, rollout | Member 1 |
| K-Means, QR, spatial decay, optimizer | Member 2 |
| App, deployment, Explain/XAI, demo | Member 3 |
| Data cleaning, quarantine, reproducibility | Member 2 |
| Ethics / GenAI disclosure | Member 1 or 3 |

**Every member** must be able to answer at least one question on dataset, model, and business applicability.

---

## Pre-finale runbook (day before)

```bash
# From repo root
python src/verify_all.py          # expect 327 PASS / 0 FAIL
```

- [ ] Export **finale presentation deck** to PDF (14 slides)
- [ ] Export **technical paper** to PDF (≤10 pages)
- [ ] Test **stackkings.inusha.me** on venue network
- [ ] Rehearse **10 min pitch + 5 min demo** with timer
- [ ] All 3 members review **numbers cheat sheet** (below)
- [ ] Professional dress · laptops charged · clicker tested

---

## Numbers cheat sheet

| Metric | Value |
|--------|--------|
| Outlets scored | 20,000 |
| Western outlets | ~9,000 |
| Transactions processed | ~2.3M rows |
| Quarantined records | 37,205 (with reason codes) |
| Budget optimized | LKR 5,000,000 |
| Incremental liters (optimized) | ~1,004,555 L |
| ROI | ~201 L per LKR 1,000 |
| Lift vs naive top-500 equal split | +253% |
| Median uplift vs own historical max | 1.26× |
| Backtest floor (pred ≥ own max) | 100% |
| QA checks | 327 PASS / 0 FAIL |
| Outlets receiving trade spend | 6,395 |

---

## Note on “Streamlit” in the guidelines

The finale PDF references a **Streamlit** demo. Stack Kings ships a **Next.js Outlet Intelligence Web App** instead — same judging intent (working prototype, user workflow, key insights), with **production deployment** on Vercel. In slide 12, state:

> *"We implemented an enterprise-grade web application (Next.js) rather than Streamlit for field-ready UX, HTTPS deployment, and hybrid explainable AI via API routes."*

---

*Slide content for all 14 sections: `docs/finale_presentation_deck.md`*
