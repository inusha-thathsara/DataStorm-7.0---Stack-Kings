import type { ExplainSource, Outlet } from "./types";
import type { ExplainErrorCode } from "./explainErrors";
import { explainErrorMessage, mapGeminiHttpStatus } from "./explainErrors";
import {
  EXPLAIN_JSON_SCHEMA,
  parseExplainInput,
  stableStringifyExplanation,
  type StructuredExplanation,
} from "./explainSchema";
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  buildOllamaChatBody,
  buildTemplateJson,
  buildTemplateStructured,
  buildXaiPrompt,
  isTemplateExplanation,
  normalizeLlmExplanation,
  parseVerifiedOllamaResponse,
  resolveOllamaNumGpu,
  type ExplainMeta,
} from "./xaiShared";

export {
  buildTemplateExplanation,
  buildTemplateJson,
  buildTemplateStructured,
  buildXaiPayload,
  buildXaiPrompt,
  formatExplainMeta,
} from "./xaiShared";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export type ExplainResolution = {
  payload: StructuredExplanation;
  explanation: string;
  source: ExplainSource;
  meta?: ExplainMeta;
  warning?: string;
  errorCode?: ExplainErrorCode;
  cached?: boolean;
};

function payloadToWire(payload: StructuredExplanation): string {
  return stableStringifyExplanation(payload);
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
  const numGpu = resolveOllamaNumGpu(process.env.OLLAMA_NUM_GPU);
  return { base, model, timeoutMs, numGpu };
}

export async function fetchOllamaExplanation(
  outlet: Outlet
): Promise<{ payload: StructuredExplanation; meta: ExplainMeta } | { errorCode: ExplainErrorCode } | null> {
  if (!isOllamaEnabled()) return null;

  const { base, model, timeoutMs, numGpu } = ollamaConfig();
  const prompt = buildXaiPrompt(outlet);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify(buildOllamaChatBody(model, prompt, numGpu)),
    });
    if (!res.ok) {
      console.warn(`[xai/ollama] HTTP ${res.status}`);
      return { errorCode: "OLLAMA_UNREACHABLE" };
    }
    const data = await res.json();
    const verified = parseVerifiedOllamaResponse(data);
    if (!verified) {
      console.warn("[xai/ollama] unverified response");
      return { errorCode: "OLLAMA_INVALID_JSON" };
    }
    const payload =
      normalizeLlmExplanation(verified.text, outlet) ?? parseExplainInput(verified.text);
    if (!payload) return { errorCode: "OLLAMA_INVALID_JSON" };
    if (isTemplateExplanation(outlet, payload)) {
      console.warn("[xai/ollama] output matched template");
      return { errorCode: "OLLAMA_INVALID_JSON" };
    }
    return { payload, meta: verified.meta };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[xai/ollama] request failed: ${msg}`);
    if (err instanceof Error && err.name === "AbortError") return { errorCode: "OLLAMA_TIMEOUT" };
    return { errorCode: "OLLAMA_UNREACHABLE" };
  } finally {
    clearTimeout(timer);
  }
}

function geminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key === "your_gemini_key_here") return null;
  return key;
}

function buildGeminiGenerationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 1536,
    responseMimeType: "application/json",
    responseSchema: EXPLAIN_JSON_SCHEMA,
  };
  if (/gemini-2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; errorCode: ExplainErrorCode };

function parseGeminiResponse(data: unknown): GeminiResult {
  const row = data as {
    candidates?: {
      content?: { parts?: { text?: string; thought?: boolean }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (row.promptFeedback?.blockReason) {
    console.warn(`[xai/gemini] blocked: ${row.promptFeedback.blockReason}`);
    return { ok: false, errorCode: "GEMINI_BLOCKED" };
  }

  const candidate = row.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!parts?.length) {
    console.warn(`[xai/gemini] empty response (${candidate?.finishReason ?? "no candidates"})`);
    return { ok: false, errorCode: "GEMINI_EMPTY" };
  }

  const text = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text!)
    .join("")
    .trim();
  if (!text) return { ok: false, errorCode: "GEMINI_EMPTY" };
  return { ok: true, text };
}

export async function fetchGeminiExplanation(
  outlet: Outlet,
  apiKey: string
): Promise<{ payload: StructuredExplanation } | { errorCode: ExplainErrorCode }> {
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
          generationConfig: buildGeminiGenerationConfig(model),
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[xai/gemini] HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return { errorCode: mapGeminiHttpStatus(res.status) };
    }
    const data = await res.json();
    const parsed = parseGeminiResponse(data);
    if (!parsed.ok) return { errorCode: parsed.errorCode };

    const payload =
      normalizeLlmExplanation(parsed.text, outlet) ?? parseExplainInput(parsed.text);
    if (!payload) return { errorCode: "GEMINI_INVALID_JSON" };
    if (isTemplateExplanation(outlet, payload)) {
      return { errorCode: "GEMINI_INVALID_JSON" };
    }
    return { payload };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[xai/gemini] request failed: ${msg}`);
    return { errorCode: "GEMINI_EMPTY" };
  }
}

export async function resolveHybridExplanation(
  outlet: Outlet,
  options?: { skipOllama?: boolean }
): Promise<ExplainResolution> {
  const template = buildTemplateStructured(outlet);

  if (!options?.skipOllama) {
    const ollama = await fetchOllamaExplanation(outlet);
    if (ollama && "payload" in ollama) {
      return {
        payload: ollama.payload,
        explanation: payloadToWire(ollama.payload),
        source: "ollama",
        meta: ollama.meta,
      };
    }
  }

  const apiKey = geminiApiKey();
  if (!apiKey) {
    return {
      payload: template,
      explanation: buildTemplateJson(outlet),
      source: "template",
      errorCode: options?.skipOllama ? "NO_API_KEY" : undefined,
      warning: explainErrorMessage("NO_API_KEY") + " Used deterministic pipeline template.",
    };
  }

  const gemini = await fetchGeminiExplanation(outlet, apiKey);
  if ("payload" in gemini) {
    return {
      payload: gemini.payload,
      explanation: payloadToWire(gemini.payload),
      source: "gemini",
    };
  }

  return {
    payload: template,
    explanation: buildTemplateJson(outlet),
    source: "template",
    errorCode: gemini.errorCode,
    warning: `${explainErrorMessage(gemini.errorCode)} Used deterministic pipeline template.`,
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

export { explainErrorMessage };
