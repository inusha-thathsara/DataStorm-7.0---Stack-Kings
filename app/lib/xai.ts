import type { ExplainSource, Outlet } from "./types";
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  buildOllamaChatBody,
  buildTemplateExplanation,
  buildXaiPayload,
  buildXaiPrompt,
  isTemplateExplanation,
  parseVerifiedOllamaResponse,
  resolveOllamaNumGpu,
  type ExplainMeta,
} from "./xaiShared";

export {
  buildTemplateExplanation,
  buildXaiPayload,
  buildXaiPrompt,
  formatExplainMeta,
} from "./xaiShared";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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
): Promise<{ text: string; meta: ExplainMeta } | null> {
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
      const errBody = await res.text().catch(() => "");
      console.warn(`[xai/ollama] HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const verified = parseVerifiedOllamaResponse(data);
    if (!verified) {
      console.warn("[xai/ollama] unverified response (missing eval_count or content)");
      return null;
    }
    if (isTemplateExplanation(outlet, verified.text)) {
      console.warn("[xai/ollama] output matched template — not labeling as Ollama");
      return null;
    }
    return { text: verified.text, meta: verified.meta };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[xai/ollama] request failed: ${msg}`);
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

function buildGeminiGenerationConfig(model: string): Record<string, unknown> {
  const config: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: 1024,
  };
  // Gemini 2.5 counts internal thinking tokens against maxOutputTokens by default.
  // Disable thinking so the full budget is used for the visible explanation.
  if (/gemini-2\.5/i.test(model)) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }
  return config;
}

function parseGeminiResponseText(data: unknown): string | null {
  const parts = (data as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })
    ?.candidates?.[0]?.content?.parts;
  if (!parts?.length) return null;
  const text = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text!)
    .join("")
    .trim();
  return text || null;
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
          generationConfig: buildGeminiGenerationConfig(model),
        }),
      }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn(`[xai/gemini] HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return parseGeminiResponseText(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[xai/gemini] request failed: ${msg}`);
    return null;
  }
}

/**
 * Server-side hybrid XAI (used when client Ollama is skipped): Ollama → Gemini → template.
 * Client should prefer resolveExplanation() in xaiClient.ts for browser-direct Ollama.
 */
export async function resolveHybridExplanation(
  outlet: Outlet,
  options?: { skipOllama?: boolean }
): Promise<{ explanation: string; source: ExplainSource; meta?: ExplainMeta; warning?: string }> {
  if (!options?.skipOllama) {
    const ollama = await fetchOllamaExplanation(outlet);
    if (ollama) {
      return { explanation: ollama.text, source: "ollama", meta: ollama.meta };
    }
  }

  const apiKey = geminiApiKey();
  if (apiKey) {
    const geminiText = await fetchGeminiExplanation(outlet, apiKey);
    if (geminiText && !isTemplateExplanation(outlet, geminiText)) {
      return { explanation: geminiText, source: "gemini" };
    }
  }

  return {
    explanation: buildTemplateExplanation(outlet),
    source: "template",
    warning: options?.skipOllama
      ? apiKey
        ? "Gemini did not return a usable explanation. Used deterministic template."
        : "No cloud LLM configured. Used deterministic template."
      : "Used deterministic template (Ollama and Gemini unavailable).",
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
