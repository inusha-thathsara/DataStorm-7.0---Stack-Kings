import type { ExplainDriverRef, ExplainMetricRef, ExplainSwotItem } from "./explainSchema";

export type RefHighlight = {
  scrollTargetId: string;
  highlightFeature?: string;
  highlightMetric?: ExplainMetricRef;
  competitionKey?: "saturationPenalty" | "isolationBoost";
};

const METRIC_TARGETS: Record<ExplainMetricRef, RefHighlight> = {
  gapLiters: { scrollTargetId: "chart-potential", highlightMetric: "gapLiters" },
  predictedLiters: { scrollTargetId: "chart-potential", highlightMetric: "predictedLiters" },
  ownMaxVol: { scrollTargetId: "chart-potential", highlightMetric: "ownMaxVol" },
  recent3mAvg: { scrollTargetId: "chart-potential", highlightMetric: "recent3mAvg" },
  tradeSpendLkr: { scrollTargetId: "section-trade-spend", highlightMetric: "tradeSpendLkr" },
  marketSaturation: { scrollTargetId: "section-environment", highlightMetric: "marketSaturation" },
  competitorDensity: { scrollTargetId: "section-environment", highlightMetric: "competitorDensity" },
  adjustmentFactor: { scrollTargetId: "section-competition", highlightMetric: "adjustmentFactor" },
  janFactor: { scrollTargetId: "chart-potential", highlightMetric: "janFactor" },
};

export function resolveDriverRef(ref: ExplainDriverRef): RefHighlight {
  if (ref.kind === "metric") return METRIC_TARGETS[ref.key];
  if (ref.kind === "qrDriver") {
    return { scrollTargetId: "chart-features", highlightFeature: ref.feature };
  }
  return {
    scrollTargetId: "section-competition",
    competitionKey: ref.key,
  };
}

export function resolveSwotItemRefs(item: ExplainSwotItem): RefHighlight | null {
  const first = item.refs?.[0];
  if (!first) return null;
  return resolveDriverRef(first);
}

export function scrollToHighlight(targetId: string): void {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}
