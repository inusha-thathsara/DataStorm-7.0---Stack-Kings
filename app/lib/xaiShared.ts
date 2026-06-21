import type { ExplainMeta, Outlet } from "./types";
import {
  buildStructuredTemplateExplanation,
  buildStructuredTemplateJson,
  buildTemplateLegacyText,
  topQrDrivers,
} from "./explainFormat";
import {
  EXPLAIN_JSON_INSTRUCTION,
  repairStructuredExplanation,
  stableStringifyExplanation,
  type StructuredExplanation,
  type StructuredSwot,
} from "./explainSchema";

function hasStructuredSwot(swot: StructuredExplanation["swot"]): boolean {
  return (
    swot.strengths.length +
      swot.weaknesses.length +
      swot.opportunities.length +
      swot.threats.length >
    0
  );
}

function mergeSwotQuadrants(llm: StructuredSwot, template: StructuredSwot): StructuredSwot {
  return {
    strengths: llm.strengths.length ? llm.strengths : template.strengths,
    weaknesses: llm.weaknesses.length ? llm.weaknesses : template.weaknesses,
    opportunities: llm.opportunities.length ? llm.opportunities : template.opportunities,
    threats: llm.threats.length ? llm.threats : template.threats,
  };
}

/** Parse and repair LLM JSON; fill empty SWOT quadrants and summary from pipeline template. */
export function normalizeLlmExplanation(
  text: string,
  outlet?: Outlet
): StructuredExplanation | null {
  const repaired = repairStructuredExplanation(text);
  if (!repaired) return null;

  let swot = repaired.swot;
  let summary = repaired.summary;

  if (outlet) {
    const template = buildStructuredTemplateExplanation(outlet);
    if (!hasStructuredSwot(swot)) {
      swot = template.swot;
    } else {
      swot = mergeSwotQuadrants(swot, template.swot);
    }
    if (summary.length === 0) {
      summary = template.summary;
    }
  }

  if (!hasStructuredSwot(swot) && summary.length === 0) return null;

  return { swot, summary };
}

export const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "gemma3:1b";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;
export const DEFAULT_OLLAMA_NUM_GPU = 999;

export type { ExplainMeta };

export type VerifiedOllamaResult = {
  text: string;
  payload: StructuredExplanation;
  meta: ExplainMeta;
};

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
    instructions: EXPLAIN_JSON_INSTRUCTION,
  };
}

export function buildXaiPrompt(outlet: Outlet): string {
  return (
    "Analyze this FMCG outlet and return structured JSON for SWOT + business summary. " +
    EXPLAIN_JSON_INSTRUCTION +
    "\n\nOutlet data:\n" +
    JSON.stringify(buildXaiPayload(outlet), null, 2)
  );
}

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
    format: "json",
    messages: [
      {
        role: "system",
        content:
          "You are a FMCG analytics assistant. Respond with a single JSON object matching the schema. " +
          "Never put JSON inside summary strings. No markdown fences or preamble. Example: " +
          '{"swot":{"strengths":[{"text":"High gap"}],"weaknesses":[{"text":"Low history"}],"opportunities":[{"text":"Seasonal uplift"}],"threats":[{"text":"Competition"}]},"summary":["One paragraph about the outlet."]}',
      },
      { role: "user", content: prompt },
    ],
    options: {
      temperature: 0.2,
      num_predict: 1536,
      num_gpu: numGpu,
      main_gpu: 0,
    },
  };
}

export function parseVerifiedOllamaResponse(data: unknown): Omit<VerifiedOllamaResult, "payload"> & { payload?: StructuredExplanation } | null {
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

  const payload = normalizeLlmExplanation(text, undefined) ?? undefined;

  return {
    text,
    payload,
    meta: {
      model,
      evalCount,
      totalDurationMs: Math.round(Number(row.total_duration ?? 0) / 1_000_000),
      loadDurationMs: Math.round(Number(row.load_duration ?? 0) / 1_000_000),
      promptEvalCount: Number(row.prompt_eval_count ?? 0),
    },
  };
}

export function isTemplateExplanation(outlet: Outlet, payload: StructuredExplanation): boolean {
  const template = buildStructuredTemplateExplanation(outlet);
  return stableStringifyExplanation(payload) === stableStringifyExplanation(template);
}

export function buildTemplateExplanation(outlet: Outlet): string {
  return buildTemplateLegacyText(outlet);
}

export function buildTemplateStructured(outlet: Outlet): StructuredExplanation {
  return buildStructuredTemplateExplanation(outlet);
}

export function buildTemplateJson(outlet: Outlet): string {
  return buildStructuredTemplateJson(outlet);
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

export { topQrDrivers };
