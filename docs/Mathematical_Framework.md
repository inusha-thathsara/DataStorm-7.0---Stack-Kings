# Mathematical Framework — Stack Kings

**Team:** Stack Kings  
**Competition:** Data Storm 7.0 Round 2  
**Scope:** Latent FMCG demand ceiling estimation (20,000 outlets) and LKR 5M Western Province trade-spend optimization

This document explains the equations, assumptions, and constants used in the pipeline. Implementation lives under `src/`; narrative context appears in [`report.md`](../report.md) and [`StackKings_Technical_Paper.md`](StackKings_Technical_Paper.md).

---

## Notation

| Symbol | Meaning |
|--------|---------|
| \(i\) | Outlet index (\(i = 1,\ldots,20{,}000\)) |
| \(Y_i^\*\) | Latent (true) monthly demand in liters |
| \(Y_i\) | Observed monthly volume (censored) |
| \(C_i\) | Effective supply constraint (credit, allocation, delivery) |
| \(X_i\) | Feature vector for outlet \(i\) |
| \(\mathbf{d}_{ij}\) | Distance (km) from outlet \(i\) to POI or competitor \(j\) |
| \(\beta_c\) | Distance-decay rate for POI category \(c\) (1/km) |

---

## 1. The Censoring Problem

### 1.1 Observation model

Observed sales are a **lower bound** on latent demand because supply caps bind before demand is fully expressed:

\[
Y_i = \min(Y_i^\*,\, C_i)
\]

When \(C_i < Y_i^\*\), the outlet is **right-censored** (we see the cap, not the true demand). Therefore:

\[
\mathbb{E}[Y_i \mid X_i] < \mathbb{E}[Y_i^\* \mid X_i]
\]

Mean regression on \(Y_i\) systematically **underestimates** potential. The competition target is the **upper tail** — maximum monthly purchase potential — not the censored mean.

> **Terminology:** The problem statement occasionally says "left-censored"; the correct statistical term for \(\min(Y^\*, C)\) with supply binding from above is **right-censoring**. We use right-censoring throughout code and papers.

### 1.2 Why not Tobit?

Classical Tobit regression assumes:

\[
Y_i^\* = X_i^\top \beta + \varepsilon_i,\quad \varepsilon_i \sim \mathcal{N}(0, \sigma^2)
\]
\[
Y_i = \begin{cases} Y_i^\* & \text{if } Y_i^\* > 0 \\ 0 & \text{otherwise} \end{cases}
\]

MLE requires **censoring indicators** \(\delta_i \in \{0,1\}\) (did observation \(i\) hit the supply cap?). Those indicators are **not available** in this dataset — every transaction may or may not be constrained. Without \(\delta_i\), the Tobit likelihood is **unidentified**. We document this gap rather than misapply the model (`phase4_quantile.py`, `report.md` §3.2).

### 1.3 Modeling strategy

Because \(Y_i^\*\) is unobserved, we estimate ceilings with two complementary proxies:

1. **Peer reference (K-Means):** unconstrained peers in similar clusters reveal group-level ceilings.
2. **Upper-quantile regression (QR):** \(\hat{Q}_{0.90}(Y_i \mid X_i)\) on observed volumes — conservative vs. \(Q_{0.90}(Y_i^\* \mid X_i)\) but feature-driven.

The final prediction combines both, adjusts for local competition, applies January seasonality, and enforces feasibility floors.

---

## 2. Spatial Feature Mathematics

### 2.1 Planar distance at Sri Lanka latitude

For outlet coordinates \((\phi_i, \lambda_i)\) in degrees, we scale to km using the centroid latitude \(\phi_0 = 7.8°\):

\[
\text{km per ° lat} = 111.32
\]
\[
\text{km per ° lon} = 111.32 \cdot \cos(\phi_0) \approx 110.2
\]

Nearest-neighbour queries use `scipy.spatial.cKDTree` on scaled coordinates. Planar error at 1–3 km radii is **< 0.3%** (`report.md` §2.3).

### 2.2 Exponential distance-decay POI influence

Round 2 replaces flat disk counts with gravity-style proximity weights (`src/spatial_decay.py`).

For outlet \(i\) and POI \(j\) in category \(c\):

\[
\text{decay\_}c(i) = \sum_{j \in \mathcal{P}_c(i)} \exp(-\beta_c \cdot d_{ij})
\]

where \(\mathcal{P}_c(i)\) is the set of POIs in category \(c\) within **10 km** of outlet \(i\) (`MAX_SEARCH_KM`), and \(d_{ij}\) is distance in km.

**Category-specific \(\beta_c\) (1/km)** — `DEFAULT_BETA`:

| Tier | \(\beta_c\) | Categories | Half-distance \(d_{1/2} = \ln(2)/\beta\) |
|------|------------:|------------|-------------------------------------------|
| Fast | 3.0 | transport, food | ~231 m |
| Medium | 2.0 | health, market, tourism | ~347 m |
| Slow | 1.5 | education, worship | ~462 m |

**Single-POI weight** \(w(d) = e^{-\beta d}\):

| \(d\) (km) | \(\beta=1.5\) | \(\beta=2.0\) | \(\beta=3.0\) |
|-----------:|--------------:|--------------:|--------------:|
| 0.25 | 0.69 | 0.61 | 0.47 |
| 0.5 | 0.47 | 0.37 | 0.22 |
| 1.0 | 0.22 | 0.14 | 0.05 |
| 2.0 | 0.05 | 0.02 | 0.002 |

Values are **domain-calibrated priors**, not grid-searched on January 2026 labels (unobserved). Sensitivity analysis: `python src/summarize_decay_beta.py` → `metadata/decay_beta_sensitivity.csv`.

**Legacy comparison (A/B only):**

\[
\text{count\_}c(i, r) = \big|\{ j : d_{ij} \le r \}\big|
\]

for \(r \in \{1\text{ km}, 3\text{ km}\}\).

### 2.3 Competitive catchment density

Outlet-to-outlet competition (`src/spatial_competition.py`):

\[
N_i(r) = \text{count of other outlets within radius } r
\]
\[
\text{competitor\_density\_index}_i = \frac{N_i(1\text{ km})}{\pi \cdot (1\text{ km})^2} \quad \text{(outlets per km²)}
\]

Z-score across all geocoded outlets:

\[
z_i = \frac{\text{density\_index}_i - \mu}{\sigma}
\]

**Normalized density** for competition adjustment (used in `phase4_predict.py`):

1. Re-standardize \(z_i\) to \(z'_i = (z_i - \bar{z})/s_z\)
2. Min–max to \([0,1]\):

\[
\tilde{d}_i = \frac{z'_i - \min_j z'_j}{\max_j z'_j - \min_j z'_j}
\]

`market_saturation_label` is a tertile of raw density (low / medium / high). DBSCAN (`eps ≈ 0.5 km`, `min_samples = 3`) assigns geographic cluster zones for analytics.

---

## 3. Method A — K-Means Lookalike Ceilings

**Implementation:** `src/phase4_model.py`

### 3.1 Clustering

Outlets are partitioned into **\(K = 50\)** clusters via K-Means on z-score normalized features (`scipy.cluster.vq.kmeans2`, `whiten`):

\[
\mathbf{f}_i = \big(\text{mean\_vol},\, \text{p90\_vol},\, \text{std\_vol},\, \text{recent\_3m},\, \text{jan\_avg},\, \text{size\_score},\, \text{cooler\_count},\, \text{decay\_features}\big)
\]

Round 2 uses six decay POI features (`decay_transport`, `decay_food`, `decay_worship`, `decay_education`, `decay_market`, `decay_total`) from `modeling_features.py`.

### 3.2 Cluster ceiling

For cluster \(k\), let \(\mathcal{I}_k\) be member outlets with observed history:

\[
\text{cluster\_ceiling}_k = Q_{0.90}\Big(\{\max\_monthly\_vol_i : i \in \mathcal{I}_k\}\Big)
\]

The 90th percentile of peer maxima approximates what **less-constrained lookalikes** have already achieved.

### 3.3 Per-outlet base ceiling (pre-January)

With outlet own statistics:

\[
\text{own\_floor}_i = \max\big(1.05 \cdot \text{p90\_monthly\_vol}_i,\; \max\_monthly\_vol_i\big)
\]

The **1.05 factor** (`P90_SAFETY`) buffers against censoring even at the observed 90th percentile.

\[
\text{base\_ceiling}_i = \max(\text{own\_floor}_i,\; \text{cluster\_ceiling}_{k(i)})
\]

Outlets with **no transaction history** use \(\text{cluster\_ceiling}_{k(i)}\) directly.

---

## 4. Method B — Quantile Regression (\(\tau = 0.90\))

**Implementation:** `src/phase4_quantile.py`

### 4.1 Pinball loss

Linear quantile regression finds \(\beta\) minimizing the asymmetric **pinball loss** at quantile level \(\tau = 0.90\):

\[
\mathcal{L}_\tau(u) = \begin{cases} \tau \cdot u & \text{if } u \ge 0 \\ (\tau - 1) \cdot u & \text{if } u < 0 \end{cases}
\]

For residuals \(u_i = y_i - X_i^\top \beta\):

\[
\min_\beta \; \frac{1}{n}\sum_{i=1}^{n} \mathcal{L}_\tau(y_i - X_i^\top \beta)
\]

**Interpretation:** \(\hat{Q}_{0.90}(Y_i \mid X_i) = X_i^\top \hat{\beta}\) estimates the **conditional 90th percentile** of observed volume.

Because censoring pulls observed volumes downward:

\[
\hat{Q}_{0.90}(Y_i \mid X_i) \lesssim Q_{0.90}(Y_i^\* \mid X_i)
\]

So QR provides a **conservative, feature-driven** ceiling — high-size, high-cooler, high-decay outlets receive higher predictions.

**Optimization:** L-BFGS-B with analytic gradient; warm-start from OLS. Target \(y_i = \max\_monthly\_vol_i\).

### 4.2 QR raw ceiling (pre-January)

\[
\text{qr\_raw\_ceiling}_i = \max(X_i^\top \hat{\beta},\, 0)
\]

January scaling is applied later in the unified pipeline (§5.3).

---

## 5. Unified Ensemble Prediction

**Implementation:** `src/phase4_predict.py` — **single source of truth** for `StackKings_predictions.csv`.

### 5.1 Pre-January ensemble

\[
\text{base\_ensemble}_i = \max\big(\text{kmeans\_base\_ceiling}_i,\; \text{qr\_raw\_ceiling}_i\big)
\]

Taking the maximum ensures neither peer-reference nor regression ceiling dominates downward.

### 5.2 Competition adjustment

Constants: \(\gamma = 0.20\), \(\delta = 0.10\).

\[
\text{saturation\_penalty}_i = 1 - \gamma \cdot \tilde{d}_i
\]
\[
\text{isolation\_boost}_i = 1 + \delta \cdot (1 - \tilde{d}_i)
\]
\[
\text{adjustment}_i = \text{saturation\_penalty}_i \times \text{isolation\_boost}_i
\]
\[
\text{adjusted\_ceiling}_i = \text{base\_ensemble}_i \times \text{adjustment}_i
\]

**Intuition:**

- **High density** (\(\tilde{d}_i \to 1\)): penalty \(\to 1-\gamma = 0.80\), boost \(\to 1\) → net **−20%** (crowded catchment moderates latent potential).
- **Low density** (\(\tilde{d}_i \to 0\)): penalty \(\to 1\), boost \(\to 1+\delta = 1.10\) → net **+10%** (isolated catchment uplift).

At \(\tilde{d}_i = 0.5\): adjustment \(= 0.90 \times 1.05 = 0.945\) (slight downward tilt).

### 5.3 January 2026 seasonality

\[
\text{jan\_factor}_i = \begin{cases} \dfrac{\text{jan\_avg}_i}{\text{mean\_vol}_i} & \text{if January history exists} \\[6pt] s(\text{distributor label}) & \text{otherwise} \end{cases}
\]

Distributor seasonality labels (`DIST_SEASON`):

| Label | Factor |
|-------|-------:|
| Favorable | 1.15 |
| Moderate | 1.00 |
| Un-Favorable | 0.87 |

### 5.4 Feasibility floors

**Primary floor** (volume already demonstrated):

\[
\text{prediction}_i = \max\big(\text{adjusted\_ceiling}_i \times \text{jan\_factor}_i,\; \max\_monthly\_vol_i,\; 1.0\big)
\]

**Cooler replenishment soft floor** (supply-cycle proxy):

\[
\text{replenishment\_cap}_i = \text{cooler\_count}_i \times 50 \text{ L/cycle} \times 4 \text{ cycles/month}
\]

If \(\text{cooler\_count}_i > 0\) and prediction falls below \(0.8 \times \text{replenishment\_cap}_i\):

\[
\text{prediction}_i \leftarrow \max\big(0.8 \times \text{replenishment\_cap}_i,\; \max\_monthly\_vol_i,\; 1.0\big)
\]

This is a **soft floor** (documented supply proxy), not a hard cap on latent potential.

### 5.5 Gap for optimization

\[
\text{gap}_i = \max\big(\text{prediction}_i - \text{recent\_3m\_avg}_i,\; 0\big)
\]

Used as the addressable uplift baseline in §6.

### 5.6 Validation properties

| Property | Result |
|----------|--------|
| Predictions below own historical max | **0** |
| Backtest coverage (active outlets) | **100%** |
| Median uplift (prediction / own max) | **1.26×** |
| QR test-set coverage (\(\ge\) own max) | **89.8%** |

---

## 6. Trade-Spend Optimization (LKR 5M, Western Province)

**Implementation:** `src/phase4_optimize.py`  
**Scope:** 9,000 outlets, distributors `DIST_W_01`–`DIST_W_03`

### 6.1 Objective

Maximize **incremental liters** vs. recent 3-month baseline, not raw potential ranking:

\[
\max_{\{x_i\}} \sum_i \Delta\text{vol}_i(x_i)
\]

where \(x_i \ge 0\) is trade spend (LKR) allocated to outlet \(i\).

### 6.2 Diminishing-returns response curve

\[
\Delta\text{vol}_i(x) = \text{gap}_i \cdot \Big(1 - \exp\big(-\alpha_i \cdot x / 1000\big)\Big)
\]

Properties:

- \(\Delta\text{vol}_i(0) = 0\)
- \(\lim_{x \to \infty} \Delta\text{vol}_i(x) = \text{gap}_i\) (asymptotic ceiling = predicted potential gap)
- Marginal return \(\frac{d}{dx}\Delta\text{vol}_i = \text{gap}_i \cdot \frac{\alpha_i}{1000} \cdot e^{-\alpha_i x/1000} > 0\) and **decreasing** (concave)

**Density-adjusted \(\alpha_i\):**

Let \(z_i\) be `competitor_density_z`, standardized to \(\hat{z}_i = (z_i - \mu)/\sigma\), clipped to \([-1,1]\) via \(\hat{z}_i/3\):

\[
\alpha_i = 0.8 \cdot \Big(1 - 0.3 \cdot \text{clip}(\hat{z}_i/3,\,-1,\,1)\Big)
\]

Crowded markets have **lower \(\alpha\)** → spend converts to liters more slowly (harder to grow share).

### 6.3 Piecewise-linear LP formulation

The exponential response is **concave**, so it can be linearized with segment variables. Breakpoints (LKR): **0 → 500 → 2,000 → 10,000 → 50,000**.

For outlet \(i\) and segment \(s\), let \(y_{i,s}\) = LKR spent in segment \(s\), with segment width \(w_s\).

**Marginal liters per LKR** on segment \(s\) (average slope over the segment interval \([t_s, t_{s+1}]\)):

\[
m_{i,s} = \frac{\Delta\text{vol}_i(t_{s+1}) - \Delta\text{vol}_i(t_s)}{t_{s+1} - t_s}
\]

**Linear program** (HiGHS via `scipy.optimize.linprog`):

\[
\max \sum_{i,s} m_{i,s} \cdot y_{i,s}
\]

subject to:

\[
\sum_{i,s} y_{i,s} \le 5{,}000{,}000 \quad \text{(total budget)}
\]
\[
0 \le y_{i,s} \le w_s \quad \forall i,s \quad \text{(segment bounds)}
\]
\[
\sum_s y_{i,s} \le \text{cap}_i \quad \forall i \quad \text{(per-outlet spend cap)}
\]

Optional floor on top-100 gap outlets: \(\sum_s y_{i,s} \ge 2{,}000\) LKR when LP-feasible.

**Per-outlet spend cap:**

\[
\text{cap}_i = \min\Big(50{,}000,\; \max\big(500,\; 0.05 \times \text{gap}_i \times 50 \text{ LKR/L}\big)\Big)
\]

Total spend per outlet: \(x_i = \sum_s y_{i,s}\).

### 6.4 Results (reference)

From `metadata/optimization_report.csv`:

| Metric | Value |
|--------|------:|
| Total spend | LKR 5,000,000 |
| Incremental volume | ~1,004,555 L |
| ROI | ~201 L / LKR 1,000 |
| vs. naive top-500 equal split | **+253%** lift |

---

## 7. Constants Reference

| Constant | Value | Location |
|----------|------:|----------|
| K-Means clusters \(K\) | 50 | `phase4_model.py` |
| Cluster ceiling quantile | 90th pct | `phase4_model.py` |
| P90 safety multiplier | 1.05 | `phase4_model.py` |
| QR quantile \(\tau\) | 0.90 | `phase4_quantile.py` |
| Competition \(\gamma\) | 0.20 | `phase4_predict.py` |
| Competition \(\delta\) | 0.10 | `phase4_predict.py` |
| Cooler liters/cycle | 50 | `phase4_predict.py` |
| Cycles/month | 4 | `phase4_predict.py` |
| Cooler floor ratio | 0.8 | `phase4_predict.py` |
| Prediction minimum | 1.0 L | `phase4_predict.py` |
| Optimizer budget | 5,000,000 LKR | `phase4_optimize.py` |
| \(\alpha\) base | 0.8 | `phase4_optimize.py` |
| Max spend/outlet | 50,000 LKR | `phase4_optimize.py` |
| Unit price (cap calc) | 50 LKR/L | `phase4_optimize.py` |
| POI search radius | 10 km | `spatial_decay.py` |
| DBSCAN \(\varepsilon\) | 0.5 km | `spatial_competition.py` |

---

## 8. Pipeline Order

Equations above are evaluated in this sequence:

```
phase3_gold_features.py   → spatial decay + competition features
phase4_aggregate.py       → outlet statistics
phase4_model.py           → K-Means ceilings
phase4_quantile.py        → QR ceilings
phase4_predict.py         → ensemble + adjustment + floors  → predictions_final.csv
phase4_optimize.py        → LP budget allocation             → StackKings_budget_allocations.csv
phase5_submit.py          → submission CSV validation
```

One command: `python src/run_round2_pipeline.py`

---

## 9. Related Documents

| Document | Focus |
|----------|-------|
| [`report.md`](../report.md) | Extended technical narrative |
| [`StackKings_Technical_Paper.md`](StackKings_Technical_Paper.md) | PDF-ready methodology (≤10 pages) |
| [`metadata/decay_beta_sensitivity.csv`](../metadata/decay_beta_sensitivity.csv) | β sensitivity tables |
| [`metadata/method_comparison_report.csv`](../metadata/method_comparison_report.csv) | K-Means vs QR comparison |
| [`metadata/optimization_report.csv`](../metadata/optimization_report.csv) | Budget optimizer results |

---

*Stack Kings · Data Storm 7.0 Round 2 · May 2026*
