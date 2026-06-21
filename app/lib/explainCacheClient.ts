import type { ExplainMeta, ExplainSource } from "./types";
import type { ExplainErrorCode } from "./explainErrors";
import { explainErrorMessage } from "./explainErrors";
import { parseExplainInput, stableStringifyExplanation, type StructuredExplanation } from "./explainSchema";

const SESSION_PREFIX = "stackkings:explain:";

export function sessionExplainKey(outletId: string, exportGeneratedAt: string | null): string {
  return `${SESSION_PREFIX}${outletId}:${exportGeneratedAt ?? "local"}`;
}

export function readSessionExplanation(key: string): {
  payload: StructuredExplanation;
  source: ExplainSource;
  meta?: ExplainMeta;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      payload?: StructuredExplanation;
      explanation?: string;
      source?: ExplainSource;
      meta?: ExplainMeta;
    };
    const payload =
      data.payload ??
      (typeof data.explanation === "string" ? parseExplainInput(data.explanation) : null);
    if (!payload || !data.source) return null;
    return { payload, source: data.source, meta: data.meta };
  } catch {
    return null;
  }
}

export function writeSessionExplanation(
  key: string,
  payload: StructuredExplanation,
  source: ExplainSource,
  meta?: ExplainMeta
): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    key,
    JSON.stringify({
      payload,
      explanation: stableStringifyExplanation(payload),
      source,
      meta,
    })
  );
}

export function formatExplainError(code?: ExplainErrorCode, fallback?: string): string {
  if (code) return explainErrorMessage(code);
  return fallback ?? "Explain request failed";
}
