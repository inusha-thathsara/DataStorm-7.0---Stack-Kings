import type { ExplainSource, ModelDrivers, Outlet, QrFeatureDriver } from "./types";

const DEFAULT_OLLAMA_BASE = "http://127.0.0.1:11434";
/** Gemma 4 Effective 4B — https://ollama.com/library/gemma4:e4b */
const DEFAULT_OLLAMA_MODEL = "gemma4:e4b";
const DEFAULT_OLLAMA_TIMEOUT_MS = 25_000;
/** Gemma 4 on Ollama uses "thinking" tokens; disable or content stays empty at low num_predict */
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

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

/** Shared prompt for Ollama + Gemini (fact-grounded, 3 paragraphs). */
export function buildXaiPrompt(outlet: Outlet): string {
  return (
    "Explain this FMCG outlet prediction in 3 short business paragraphs. " +
    "Use ONLY the facts in the JSON below. Include feature importance from modelDrivers.qrTopDrivers " +
    "(weight and contributionLiters) and competition adjustment weights. " +
    "Do not invent numbers, metrics, or outlet attributes.\n\n" +
    JSON.stringify(buildXaiPayload(outlet), null, 2)
  );
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

export function isOllamaEnabled(): boolean {
  if (process.env.OLLAMA_ENABLED === "false") return false;
  if (process.env.OLLAMA_ENABLED === "true") return true;
  return Boolean(process.env.OLLAMA_BASE_URL?.trim());
}

function ollamaConfig() {
  const base = (process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE).replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || DEFAULT_OLLAMA_TIMEOUT_MS;
  return { base, model, timeoutMs };
}

export async function fetchOllamaExplanation(outlet: Outlet): Promise<string | null> {
  if (!isOllamaEnabled()) return null;

  const { base, model, timeoutMs } = ollamaConfig();
  const prompt = buildXaiPrompt(outlet);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        messages: [
          {
            role: "system",
            content:
              "You are a FMCG analytics assistant. Explain predictions using only provided data. " +
              "Write exactly 3 short paragraphs in plain business language.",
          },
          { role: "user", content: prompt },
        ],
        options: { temperature: 0.2, num_predict: 512 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === "your_gemini_key_here") return null;
  return key;
}

export async function fetchGeminiExplanation(
  outlet: Outlet,
  apiKey: string
): Promise<string | null> {
  const prompt = buildXaiPrompt(outlet);
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

/**
 * Hybrid XAI: local Ollama → cloud Gemini → deterministic template.
 */
export async function resolveHybridExplanation(
  outlet: Outlet
): Promise<{ explanation: string; source: ExplainSource }> {
  const ollamaText = await fetchOllamaExplanation(outlet);
  if (ollamaText) {
    return { explanation: ollamaText, source: "ollama" };
  }

  const apiKey = geminiApiKey();
  if (apiKey) {
    const geminiText = await fetchGeminiExplanation(outlet, apiKey);
    if (geminiText) {
      return { explanation: geminiText, source: "gemini" };
    }
  }

  return {
    explanation: buildTemplateExplanation(outlet),
    source: "template",
  };
}

export function explainSourceLabel(source: ExplainSource): string {
  switch (source) {
    case "ollama":
      return "Ollama (local LLM)";
    case "gemini":
      return "Gemini API (cloud LLM)";
    case "template":
      return "Deterministic template (fallback)";
  }
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
