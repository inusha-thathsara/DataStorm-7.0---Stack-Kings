import type { ExplainErrorCode } from "./explainErrors";
import type { ExplainMeta, ExplainSource, Outlet } from "./types";
import type { StructuredExplanation } from "./explainSchema";
import { normalizeLlmExplanation } from "./xaiShared";
import { parseExplainInput, repairStructuredExplanation } from "./explainSchema";
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  buildOllamaChatBody,
  buildTemplateStructured,
  buildXaiPrompt,
  isTemplateExplanation,
  parseVerifiedOllamaResponse,
  resolveOllamaNumGpu,
  type VerifiedOllamaResult,
} from "./xaiShared";
import { stableStringifyExplanation } from "./explainSchema";
import {
  formatExplainError,
  readSessionExplanation,
  sessionExplainKey,
  writeSessionExplanation,
} from "./explainCacheClient";

export type ExplainResult = {
  payload: StructuredExplanation;
  explanation: string;
  source: ExplainSource;
  meta?: ExplainMeta;
  warning?: string;
  error?: string;
  errorCode?: ExplainErrorCode;
  cached?: boolean;
};

function clientOllamaConfig() {
  const enabled = process.env.NEXT_PUBLIC_OLLAMA_ENABLED === "true";
  if (!enabled) {
    return { enabled: false, base: "", model: "", timeoutMs: 0, numGpu: 0 };
  }
  const base = (process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE).replace(/\/$/, "");
  const model = process.env.NEXT_PUBLIC_OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
  const timeoutMs =
    Number(process.env.NEXT_PUBLIC_OLLAMA_TIMEOUT_MS) || DEFAULT_OLLAMA_TIMEOUT_MS;
  const numGpu = resolveOllamaNumGpu(process.env.NEXT_PUBLIC_OLLAMA_NUM_GPU);
  return { enabled: true, base, model, timeoutMs, numGpu };
}

export function isClientOllamaEnabled(): boolean {
  return clientOllamaConfig().enabled;
}

function ollamaFailureMessage(err: unknown, model: string): { error: string; errorCode?: ExplainErrorCode } {
  if (err instanceof DOMException && err.name === "AbortError") {
    return {
      error: formatExplainError("OLLAMA_TIMEOUT"),
      errorCode: "OLLAMA_TIMEOUT",
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|cors/i.test(msg)) {
    return {
      error: formatExplainError("OLLAMA_UNREACHABLE"),
      errorCode: "OLLAMA_UNREACHABLE",
    };
  }
  return { error: `Ollama request failed: ${msg}` };
}

export async function fetchBrowserOllamaExplanation(
  outlet: Outlet
): Promise<
  | { result: VerifiedOllamaResult & { payload: StructuredExplanation }; clientDurationMs: number }
  | { error: string; errorCode?: ExplainErrorCode }
> {
  const { enabled, base, model, timeoutMs, numGpu } = clientOllamaConfig();
  if (!enabled) {
    return { error: "Client Ollama disabled (NEXT_PUBLIC_OLLAMA_ENABLED=false)." };
  }

  const prompt = buildXaiPrompt(outlet);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const tagsRes = await fetch(`${base}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!tagsRes.ok) {
      return {
        error: formatExplainError("OLLAMA_UNREACHABLE"),
        errorCode: "OLLAMA_UNREACHABLE",
      };
    }

    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify(buildOllamaChatBody(model, prompt, numGpu)),
    });

    if (!res.ok) {
      return {
        error: formatExplainError("OLLAMA_UNREACHABLE"),
        errorCode: "OLLAMA_UNREACHABLE",
      };
    }

    const data = await res.json();
    const verified = parseVerifiedOllamaResponse(data);
    if (!verified) {
      return {
        error: formatExplainError("OLLAMA_INVALID_JSON"),
        errorCode: "OLLAMA_INVALID_JSON",
      };
    }
    const payload =
      normalizeLlmExplanation(verified.text, outlet) ?? parseExplainInput(verified.text);
    if (!payload) {
      return {
        error: formatExplainError("OLLAMA_INVALID_JSON"),
        errorCode: "OLLAMA_INVALID_JSON",
      };
    }
    if (isTemplateExplanation(outlet, payload)) {
      return {
        error: "Ollama output matched the deterministic template — not counted as LLM inference.",
        errorCode: "OLLAMA_INVALID_JSON",
      };
    }

    return {
      result: { ...verified, payload },
      clientDurationMs: Date.now() - started,
    };
  } catch (err) {
    return ollamaFailureMessage(err, model);
  } finally {
    clearTimeout(timer);
  }
}

type ServerExplainResponse = {
  explanation?: string;
  payload?: StructuredExplanation;
  source?: ExplainSource;
  meta?: ExplainMeta;
  warning?: string;
  error?: string;
  errorCode?: ExplainErrorCode;
  errorMessage?: string;
  cached?: boolean;
  generatedAt?: string;
};

async function fetchCachedExplanation(outletId: string): Promise<ExplainResult | null> {
  const res = await fetch(`/api/explain?outletId=${encodeURIComponent(outletId)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as ServerExplainResponse;
  const payload =
    data.payload ??
    (typeof data.explanation === "string" ? parseExplainInput(data.explanation) : null);
  if (!payload || !data.source) return null;
  return {
    payload,
    explanation: stableStringifyExplanation(payload),
    source: data.source,
    meta: data.meta,
    cached: true,
  };
}

async function fetchServerExplain(
  outlet: Outlet,
  refresh = false
): Promise<ExplainResult> {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outlet, skipOllama: true, refresh }),
    cache: "no-store",
  });
  const data = (await res.json()) as ServerExplainResponse;
  const payload =
    data.payload ??
    (typeof data.explanation === "string" ? parseExplainInput(data.explanation) : null);
  if (!payload) {
    throw new Error(data.errorMessage ?? data.error ?? `Explain failed (HTTP ${res.status})`);
  }
  return {
    payload,
    explanation: data.explanation ?? stableStringifyExplanation(payload),
    source: data.source ?? "template",
    meta: data.meta,
    warning: data.warning,
    errorCode: data.errorCode,
    cached: data.cached,
  };
}

export async function resolveExplanation(
  outlet: Outlet,
  options?: { exportGeneratedAt?: string | null; refresh?: boolean }
): Promise<ExplainResult> {
  const cacheKey = sessionExplainKey(outlet.id, options?.exportGeneratedAt ?? null);

  if (!options?.refresh) {
    const sessionHit = readSessionExplanation(cacheKey);
    if (sessionHit) {
      return {
        payload: sessionHit.payload,
        explanation: stableStringifyExplanation(sessionHit.payload),
        source: sessionHit.source,
        meta: sessionHit.meta,
        cached: true,
      };
    }
    const serverHit = await fetchCachedExplanation(outlet.id);
    if (serverHit) {
      writeSessionExplanation(cacheKey, serverHit.payload, serverHit.source, serverHit.meta);
      return serverHit;
    }
  }

  if (isClientOllamaEnabled()) {
    const ollamaAttempt = await fetchBrowserOllamaExplanation(outlet);
    if ("result" in ollamaAttempt) {
      const { payload } = ollamaAttempt.result;
      writeSessionExplanation(cacheKey, payload, "ollama", ollamaAttempt.result.meta);
      return {
        payload,
        explanation: stableStringifyExplanation(payload),
        source: "ollama",
        meta: ollamaAttempt.result.meta,
      };
    }

    const ollamaError = ollamaAttempt.error;
    try {
      const fallback = await fetchServerExplain(outlet, options?.refresh);
      writeSessionExplanation(cacheKey, fallback.payload, fallback.source, fallback.meta);
      return {
        ...fallback,
        warning:
          fallback.warning ??
          (fallback.source === "template"
            ? `Ollama unavailable (${ollamaError}). Used deterministic pipeline template.`
            : `Ollama unavailable (${ollamaError}). Used ${fallback.source} fallback.`),
      };
    } catch (err) {
      const template = buildTemplateStructured(outlet);
      return {
        payload: template,
        explanation: stableStringifyExplanation(template),
        source: "template",
        error: err instanceof Error ? err.message : "Explain request failed",
      };
    }
  }

  try {
    const result = await fetchServerExplain(outlet, options?.refresh);
    if (result.source !== "template") {
      writeSessionExplanation(cacheKey, result.payload, result.source, result.meta);
    }
    return result;
  } catch (err) {
    const template = buildTemplateStructured(outlet);
    return {
      payload: template,
      explanation: stableStringifyExplanation(template),
      source: "template",
      error: err instanceof Error ? err.message : "Explain request failed",
    };
  }
}

export function parsePayloadFromWire(explanation: string): StructuredExplanation | null {
  return repairStructuredExplanation(explanation) ?? parseExplainInput(explanation);
}
