import type { ExplainMeta, ModelDrivers, Outlet } from "./types";
import {
  buildSwotFromOutlet,
  formatSwotText,
  topQrDrivers,
} from "./explainFormat";

export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma3:1b";
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
      "Respond in TWO sections with these exact headings: SWOT ANALYSIS, then BUSINESS SUMMARY.",
      "Start immediately with the line SWOT ANALYSIS — no introduction, preamble, or meta-commentary.",
      "Under SWOT ANALYSIS include Strengths, Weaknesses, Opportunities, Threats — each with 2–4 bullet lines starting with '-'.",
      "Use ONLY facts from this JSON. Ground SWOT in gapLiters, modelDrivers.qrTopDrivers, competition, saturation, tradeSpendLkr, seasonality.",
      "Under BUSINESS SUMMARY write 2 short paragraphs of outlet narrative only — no filler phrases like 'here is' or 'based on the JSON'.",
      "Wrap the most important numbers and terms in **double asterisks** for highlighting (e.g. **914.7 L**, **high saturation**).",
      "Do not invent numbers, metrics, or outlet attributes.",
    ].join(" "),
  };
}

export function buildXaiPrompt(outlet: Outlet): string {
  return (
    "Analyze this FMCG outlet and produce a SWOT analysis plus a highlighted business summary. " +
    "Use ONLY the facts in the JSON below. Include feature importance from modelDrivers.qrTopDrivers " +
    "(weight and contributionLiters) and competition adjustment weights. " +
    "Do not add any introduction or preamble — begin with SWOT ANALYSIS on the first line. " +
    "Format:\n\nSWOT ANALYSIS\nStrengths:\n- ...\nWeaknesses:\n- ...\nOpportunities:\n- ...\nThreats:\n- ...\n\n" +
    "BUSINESS SUMMARY\n(2 paragraphs of narrative only; wrap key metrics in **double asterisks**)\n\n" +
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
          "No introduction or preamble. Start with SWOT ANALYSIS, then BUSINESS SUMMARY (2 paragraphs). " +
          "Highlight key metrics with **double asterisks**.",
      },
      { role: "user", content: prompt },
    ],
    options: {
      temperature: 0.2,
      num_predict: 1024,
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

function normalizeExplanationForCompare(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/^```(?:markdown|text)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** True only when text is byte-for-byte the deterministic fallback for this outlet. */
export function isTemplateExplanation(outlet: Outlet, text: string): boolean {
  return (
    normalizeExplanationForCompare(text) ===
    normalizeExplanationForCompare(buildTemplateExplanation(outlet))
  );
}

export function buildTemplateExplanation(outlet: Outlet): string {
  const swot = buildSwotFromOutlet(outlet);
  const uplift =
    outlet.ownMaxVol > 0
      ? ((outlet.predictedLiters / outlet.ownMaxVol - 1) * 100).toFixed(1)
      : "0";

  const md: ModelDrivers | undefined = outlet.modelDrivers;
  const comp = md?.competition;
  const qrNote = topQrDrivers(md?.qrTopDrivers, 3);

  const para1 =
    `Outlet **${outlet.id}** (${outlet.province}, ${outlet.distributorId}) has a predicted January 2026 potential of **${outlet.predictedLiters.toFixed(1)} L** ` +
    `(~**${uplift}%** above its historical maximum of **${outlet.ownMaxVol.toFixed(1)} L**). ` +
    `The **${outlet.dominantMethod}** ensemble estimates a latent gap of **${outlet.gapLiters.toFixed(1)} L** ` +
    `(recent 3-month average: **${(outlet.recent3mAvg ?? 0).toFixed(1)} L**).`;

  let para2 =
    `Market saturation is **${outlet.marketSaturation || "unknown"}** with competitor density **${outlet.competitorDensity.toFixed(2)}**. `;
  if (comp) {
    para2 +=
      `Competition adjustment: penalty ×**${comp.saturationPenalty.toFixed(3)}**, boost ×**${comp.isolationBoost.toFixed(3)}** ` +
      `(combined ×**${comp.combinedAdjustmentFactor.toFixed(3)}**). `;
  }
  if (qrNote) {
    para2 += `Top model drivers: **${qrNote}**. `;
  }
  if (md?.kmeansPeerSignal) {
    para2 += `${md.kmeansPeerSignal} `;
  }
  if (outlet.tradeSpendLkr > 0) {
    para2 +=
      `Recommended Western trade spend: **LKR ${outlet.tradeSpendLkr.toLocaleString()}**` +
      (outlet.predictedIncrementalLiters > 0
        ? ` (modeled incremental **+${outlet.predictedIncrementalLiters.toFixed(1)} L**).`
        : ".");
  } else {
    para2 += "No Western Province trade spend allocated for this outlet.";
  }

  return `${formatSwotText(swot)}\n\nBUSINESS SUMMARY\n\n${para1}\n\n${para2}`;
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
