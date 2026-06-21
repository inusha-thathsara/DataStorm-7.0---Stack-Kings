export type ExplainErrorCode =
  | "GEMINI_QUOTA"
  | "GEMINI_BLOCKED"
  | "GEMINI_EMPTY"
  | "GEMINI_INVALID_JSON"
  | "NO_API_KEY"
  | "OLLAMA_UNREACHABLE"
  | "OLLAMA_INVALID_JSON"
  | "OLLAMA_TIMEOUT";

const MESSAGES: Record<ExplainErrorCode, string> = {
  GEMINI_QUOTA: "Gemini rate limit reached — wait a moment and try again.",
  GEMINI_BLOCKED: "Gemini blocked this request due to safety filters.",
  GEMINI_EMPTY: "Gemini returned an empty response.",
  GEMINI_INVALID_JSON: "Gemini returned text that could not be parsed as structured SWOT JSON.",
  NO_API_KEY: "No cloud LLM API key configured on the server.",
  OLLAMA_UNREACHABLE: "Ollama is not reachable from your browser.",
  OLLAMA_INVALID_JSON: "Ollama returned text that could not be parsed as structured SWOT JSON.",
  OLLAMA_TIMEOUT: "Ollama timed out before completing the explanation.",
};

export function explainErrorMessage(code: ExplainErrorCode): string {
  return MESSAGES[code];
}

export function mapGeminiHttpStatus(status: number): ExplainErrorCode {
  if (status === 429) return "GEMINI_QUOTA";
  return "GEMINI_EMPTY";
}
