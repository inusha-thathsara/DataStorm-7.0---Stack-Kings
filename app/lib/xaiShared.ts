import type { ExplainMeta, ModelDrivers, Outlet, QrFeatureDriver } from "./types";

export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma4:e2b";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;
/** Request max GPU layer offload (Ollama caps at VRAM). 0 = CPU-only — never use for XAI. */
export const DEFAULT_OLLAMA_NUM_GPU = 999;

export type { ExplainMeta };

export type VerifiedOllamaResult = {
  text: string;
  meta: ExplainMeta;
};

/** Structured payload for LLM XAI (includes explicit feature weights / drivers). */
export function buildXaiPayload(outlet: Outlet): Record<string, unknown> {
  const md = outlet.modelDrivers;
  return {
    outletId: outlet.id,
    predictedLiters: outlet.predictedLiters,
    ownMaxVol: outlet.ownMaxVol,
    gapLiters: outlet.gapLiters,
    recent3mAvg: outlet.recent3mAvg,
    province: outlet.province,
    distributorId: outlet.distributorId,
    dominantMethod: outlet.dominantMethod,
    marketSaturation: outlet.marketSaturation,
    competitorDensity: outlet.competitorDensity,
    competitorDensityZ: outlet.competitorDensityZ,
    decayTransport: outlet.decayTransport,
    decayFood: outlet.decayFood,
    decayWorship: outlet.decayWorship,
    decayTotal: outlet.decayTotal,
    coolerCount: outlet.coolerCount,
    seasonalityLabel: outlet.seasonalityLabel,
    janFactor: outlet.janFactor,
    tradeSpendLkr: outlet.tradeSpendLkr,
    predictedIncrementalLiters: outlet.predictedIncrementalLiters,
    modelDrivers: md ?? null,
    instructions: [
      "Write exactly 3 short business paragraphs.",
      "Paragraph 1: predicted score vs historical max and gap.",
      "Paragraph 2: cite modelDrivers.qrTopDrivers (feature weights/contributions) and kmeansPeerSignal — which factors increased the ceiling.",
      "Paragraph 3: cite modelDrivers.competition (saturation penalty, isolation boost), local saturation, and trade spend if present.",
      "Use ONLY numbers and labels from this JSON. Do not invent attributes.",
    ].join(" "),
  };
}

export function buildXaiPrompt(outlet: Outlet): string {
  return (
    "Explain this FMCG outlet prediction in 3 short business paragraphs. " +
    "Use ONLY the facts in the JSON below. Include feature importance from modelDrivers.qrTopDrivers " +
    "(weight and contributionLiters) and competition adjustment weights. " +
    "Do not invent numbers, metrics, or outlet attributes.\n\n" +
    JSON.stringify(buildXaiPayload(outlet), null, 2)
  );
}

/** Parse num_gpu layers from env (999 = offload as many layers as VRAM allows). */
export function resolveOllamaNumGpu(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_OLLAMA_NUM_GPU;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_OLLAMA_NUM_GPU;
  return Math.floor(n);
}

export function buildOllamaChatBody(
  model: string,
  prompt: string,
  numGpu: number = DEFAULT_OLLAMA_NUM_GPU
): Record<string, unknown> {
  return {
    model,
    stream: false,
    think: false,
    keep_alive: "10m",
    messages: [
      {
        role: "system",
        content:
          "You are a FMCG analytics assistant. Explain predictions using only provided data. " +
          "Write exactly 3 short paragraphs in plain business language.",
      },
      { role: "user", content: prompt },
    ],
    options: {
      temperature: 0.2,
      num_predict: 512,
      /** Layers to place on GPU — high value forces GPU-first (Ollama trims to fit VRAM). */
      num_gpu: numGpu,
      main_gpu: 0,
    },
  };
}

/**
 * Only treat a response as real Ollama inference when the API reports generation tokens.
 * Prevents mis-labeling empty/cached/template text as Ollama output.
 */
export function parseVerifiedOllamaResponse(data: unknown): VerifiedOllamaResult | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.done !== true) return null;

  const evalCount = Number(row.eval_count ?? 0);
  if (!Number.isFinite(evalCount) || evalCount <= 0) return null;

  const message = row.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === "string" ? message.content.trim() : "";
  const thinking = typeof message?.thinking === "string" ? message.thinking.trim() : "";
  const text = content || thinking;
  if (!text) return null;

  const model = typeof row.model === "string" ? row.model : "";
  if (!model) return null;

  return {
    text,
    meta: {
      model,
      evalCount,
      totalDurationMs: Math.round(Number(row.total_duration ?? 0) / 1_000_000),
      loadDurationMs: Math.round(Number(row.load_duration ?? 0) / 1_000_000),
      promptEvalCount: Number(row.prompt_eval_count ?? 0),
    },
  };
}

/** Deterministic template always opens with this phrase — LLM outputs use different wording. */
export function isTemplateExplanation(outlet: Outlet, text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === buildTemplateExplanation(outlet).trim()) return true;
  const templatePrefix = `Outlet ${outlet.id} has a predicted maximum monthly potential`;
  return trimmed.startsWith(templatePrefix);
}

function formatQrDrivers(drivers: QrFeatureDriver[] | undefined): string {
  if (!drivers?.length) return "";
  return drivers
    .map(
      (d) =>
        `${d.label} (weight ${d.weight}, contribution ${d.contributionLiters} L, ${d.direction})`
    )
    .join("; ");
}

export function buildTemplateExplanation(outlet: Outlet): string {
  const uplift =
    outlet.ownMaxVol > 0
      ? ((outlet.predictedLiters / outlet.ownMaxVol - 1) * 100).toFixed(1)
      : "0";

  const driversUp: string[] = [];
  const driversDown: string[] = [];

  if (outlet.gapLiters > 100) driversUp.push("significant untapped volume gap");
  if (outlet.decayTransport > 2) driversUp.push("strong nearby transport footfall");
  if (outlet.decayFood > 1) driversUp.push("food-service POI proximity");
  if (outlet.coolerCount >= 3) driversUp.push("higher cooler capacity");
  if (outlet.janFactor > 1.05) driversUp.push("favorable January seasonality");
  if (outlet.seasonalityLabel === "Favorable") driversUp.push("distributor Favorable Jan 2026 label");
  if ((outlet.seasonalityLabel ?? "") === "Un-Favorable") driversDown.push("Un-Favorable January seasonality label");

  if (outlet.marketSaturation === "high")
    driversDown.push("high local competitor density");
  if (outlet.adjustmentFactor < 0.95)
    driversDown.push("competitive catchment penalty applied");
  if (outlet.coolerCount === 0) driversDown.push("no on-premise cooler");

  const clusterNote =
    outlet.clusterCeiling > 0
      ? ` Peer cluster ${outlet.clusterId || "n/a"} ceiling is ${outlet.clusterCeiling.toFixed(1)} L.`
      : "";

  const para1 =
    `Outlet ${outlet.id} has a predicted maximum monthly potential of ${outlet.predictedLiters.toFixed(1)} liters ` +
    `(~${uplift}% above its historical maximum of ${outlet.ownMaxVol.toFixed(1)} L). ` +
    `The model ensemble (${outlet.dominantMethod}) estimates a latent gap of ${outlet.gapLiters.toFixed(1)} liters ` +
    `(recent 3-month average: ${(outlet.recent3mAvg ?? 0).toFixed(1)} L).${clusterNote}`;

  const md: ModelDrivers | undefined = outlet.modelDrivers;
  const qrDrivers = md?.qrTopDrivers ?? [];
  const comp = md?.competition;
  const qrDriverText = formatQrDrivers(qrDrivers);

  let para2 = "";
  if (md) {
    para2 =
      `Model traceability: ${md.winningCeilingMethod === "quantile_reg" ? "Quantile regression" : "K-Means peer ceiling"} ` +
      `set the base ceiling (${md.baseEnsembleLiters.toFixed(1)} L). ${md.kmeansPeerSignal}.`;
    if (qrDriverText) {
      para2 += ` Top QR feature drivers (τ=0.90 weights): ${qrDriverText}.`;
    }
  }
  if (driversUp.length > 0) {
    para2 += ` Local signals supporting uplift: ${driversUp.join(", ")}.`;
  }
  if (!para2) {
    para2 =
      driversUp.length > 0
        ? `Factors supporting higher potential: ${driversUp.join(", ")}.`
        : "No strong positive local drivers were detected beyond peer-cluster benchmarking.";
  }

  let compNote = "";
  if (comp) {
    compNote =
      `Competition adjustment: saturation penalty ×${comp.saturationPenalty.toFixed(3)}, ` +
      `isolation boost ×${comp.isolationBoost.toFixed(3)} ` +
      `(combined ×${comp.combinedAdjustmentFactor.toFixed(3)}). `;
  }

  const para3 =
    compNote +
    (driversDown.length > 0
      ? `Factors moderating the score: ${driversDown.join(", ")}. `
      : "") +
    `Market saturation is ${outlet.marketSaturation || "unknown"} ` +
    `(competitor density index: ${outlet.competitorDensity.toFixed(2)}). ` +
    (outlet.tradeSpendLkr > 0
      ? `Recommended Western Province trade spend: LKR ${outlet.tradeSpendLkr.toLocaleString()}` +
        ((outlet.predictedIncrementalLiters ?? 0) > 0
          ? ` (modeled incremental volume: ${outlet.predictedIncrementalLiters!.toFixed(1)} L).`
          : ".")
      : "No trade spend allocated (outside Western Province budget scope or zero gap).");

  return [para1, para2, para3].join("\n\n");
}

export function formatExplainMeta(meta: ExplainMeta): string {
  const parts = [
    meta.model,
    `${meta.evalCount} tokens generated`,
    `${(meta.totalDurationMs / 1000).toFixed(1)}s total`,
  ];
  if (meta.loadDurationMs > 500) {
    parts.push(`${(meta.loadDurationMs / 1000).toFixed(1)}s model load`);
  }
  return parts.join(" · ");
}
