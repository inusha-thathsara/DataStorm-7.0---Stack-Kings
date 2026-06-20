import type { ExplainMeta, ExplainSource, Outlet } from "./types";
import {
  DEFAULT_OLLAMA_BASE,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  buildOllamaChatBody,
  buildXaiPrompt,
  isTemplateExplanation,
  parseVerifiedOllamaResponse,
  resolveOllamaNumGpu,
  type VerifiedOllamaResult,
} from "./xaiShared";

export type ExplainResult = {
  explanation: string;
  source: ExplainSource;
  meta?: ExplainMeta;
  warning?: string;
  error?: string;
};

function clientOllamaConfig() {
  const enabled = process.env.NEXT_PUBLIC_OLLAMA_ENABLED;
  if (enabled === "false") {
    return { enabled: false, base: "", model: "", timeoutMs: 0 };
  }
  const base = (process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE).replace(/\/$/, "");
  const model = process.env.NEXT_PUBLIC_OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;
  const timeoutMs =
    Number(process.env.NEXT_PUBLIC_OLLAMA_TIMEOUT_MS) || DEFAULT_OLLAMA_TIMEOUT_MS;
  const numGpu = resolveOllamaNumGpu(process.env.NEXT_PUBLIC_OLLAMA_NUM_GPU);
  return { enabled: true, base, model, timeoutMs, numGpu };
}

function ollamaFailureMessage(err: unknown, model: string): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return `Ollama timed out — increase NEXT_PUBLIC_OLLAMA_TIMEOUT_MS (${model} may need 30–120s).`;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|cors/i.test(msg)) {
    return (
      `Browser cannot reach Ollama. Start Ollama (ollama serve), pull the model (ollama pull ${model}), ` +
      "and set CORS: OLLAMA_ORIGINS=http://localhost:3000 then restart Ollama."
    );
  }
  return `Ollama request failed: ${msg}`;
}

/**
 * Call Ollama directly from the browser so inference runs on the user's machine
 * (visible in Task Manager / ollama ps) — not via the Next.js server process.
 */
export async function fetchBrowserOllamaExplanation(
  outlet: Outlet
): Promise<{ result: VerifiedOllamaResult; clientDurationMs: number } | { error: string }> {
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
      return { error: `Ollama is not reachable at ${base} (HTTP ${tagsRes.status}).` };
    }

    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      cache: "no-store",
      body: JSON.stringify(buildOllamaChatBody(model, prompt, numGpu)),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return {
        error: `Ollama /api/chat HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 160)}` : ""}`,
      };
    }

    const data = await res.json();
    const verified = parseVerifiedOllamaResponse(data);
    if (!verified) {
      return {
        error:
          `Ollama returned no generated tokens (eval_count=0 or empty content). ` +
          `Check think:false and that ${model} is pulled.`,
      };
    }
    if (isTemplateExplanation(outlet, verified.text)) {
      return { error: "Ollama output matched the deterministic template — not counted as LLM inference." };
    }

    return { result: verified, clientDurationMs: Date.now() - started };
  } catch (err) {
    return { error: ollamaFailureMessage(err, model) };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchServerFallback(
  outlet: Outlet
): Promise<{ explanation: string; source: ExplainSource; meta?: ExplainMeta; warning?: string }> {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outlet, skipOllama: true }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || !data.explanation) {
    throw new Error(data.error || `Explain fallback failed (HTTP ${res.status})`);
  }
  return {
    explanation: data.explanation,
    source: data.source ?? "template",
    meta: data.meta,
    warning: data.warning,
  };
}

/**
 * Browser-first XAI: Ollama on the client → server Gemini → template.
 */
export async function resolveExplanation(outlet: Outlet): Promise<ExplainResult> {
  const ollamaAttempt = await fetchBrowserOllamaExplanation(outlet);
  if ("result" in ollamaAttempt) {
    return {
      explanation: ollamaAttempt.result.text,
      source: "ollama",
      meta: ollamaAttempt.result.meta,
    };
  }

  const ollamaError = ollamaAttempt.error;
  try {
    const fallback = await fetchServerFallback(outlet);
    return {
      explanation: fallback.explanation,
      source: fallback.source,
      meta: fallback.meta,
      warning:
        fallback.source === "template"
          ? `Ollama unavailable (${ollamaError}). Used deterministic template.`
          : `Ollama unavailable (${ollamaError}). Used ${fallback.source} fallback.`,
    };
  } catch (err) {
    return {
      explanation: "",
      source: "template",
      error: err instanceof Error ? err.message : "Explain request failed",
    };
  }
}
