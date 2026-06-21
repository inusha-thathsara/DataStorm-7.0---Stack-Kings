import { parseExplanation, type SwotSection } from "./explainFormat";

export type ExplainMetricRef =
  | "gapLiters"
  | "predictedLiters"
  | "ownMaxVol"
  | "recent3mAvg"
  | "tradeSpendLkr"
  | "marketSaturation"
  | "competitorDensity"
  | "adjustmentFactor"
  | "janFactor";

export type ExplainDriverRef =
  | { kind: "metric"; key: ExplainMetricRef }
  | { kind: "qrDriver"; feature: string }
  | { kind: "competition"; key: "saturationPenalty" | "isolationBoost" };

export type ExplainSwotItem = {
  text: string;
  refs?: ExplainDriverRef[];
};

export type StructuredSwot = {
  strengths: ExplainSwotItem[];
  weaknesses: ExplainSwotItem[];
  opportunities: ExplainSwotItem[];
  threats: ExplainSwotItem[];
};

export type StructuredExplanation = {
  swot: StructuredSwot;
  summary: string[];
};

const METRIC_KEYS = new Set<string>([
  "gapLiters",
  "predictedLiters",
  "ownMaxVol",
  "recent3mAvg",
  "tradeSpendLkr",
  "marketSaturation",
  "competitorDensity",
  "adjustmentFactor",
  "janFactor",
]);

const SWOT_KEYS = ["strengths", "weaknesses", "opportunities", "threats"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseSwotItem(raw: unknown): ExplainSwotItem | null {
  if (typeof raw === "string" && raw.trim()) return { text: raw.trim() };
  if (!isRecord(raw) || typeof raw.text !== "string" || !raw.text.trim()) return null;
  const item: ExplainSwotItem = { text: raw.text.trim() };
  if (Array.isArray(raw.refs)) {
    const refs = raw.refs
      .map(parseDriverRef)
      .filter((r): r is ExplainDriverRef => r !== null);
    if (refs.length) item.refs = refs;
  }
  return item;
}

function parseDriverRef(raw: unknown): ExplainDriverRef | null {
  if (!isRecord(raw) || typeof raw.kind !== "string") return null;
  if (raw.kind === "metric" && typeof raw.key === "string" && METRIC_KEYS.has(raw.key)) {
    return { kind: "metric", key: raw.key as ExplainMetricRef };
  }
  if (raw.kind === "qrDriver" && typeof raw.feature === "string" && raw.feature.trim()) {
    return { kind: "qrDriver", feature: raw.feature.trim() };
  }
  if (
    raw.kind === "competition" &&
    (raw.key === "saturationPenalty" || raw.key === "isolationBoost")
  ) {
    return { kind: "competition", key: raw.key };
  }
  return null;
}

function parseSwotSection(raw: unknown): ExplainSwotItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseSwotItem).filter((i): i is ExplainSwotItem => i !== null);
}

function emptySwot(): StructuredSwot {
  return { strengths: [], weaknesses: [], opportunities: [], threats: [] };
}

function hasSwotContent(swot: StructuredSwot): boolean {
  return SWOT_KEYS.some((k) => swot[k].length > 0);
}

function extractSwotFromRecord(raw: unknown): StructuredSwot {
  if (!isRecord(raw)) return emptySwot();
  return {
    strengths: parseSwotSection(raw.strengths),
    weaknesses: parseSwotSection(raw.weaknesses),
    opportunities: parseSwotSection(raw.opportunities),
    threats: parseSwotSection(raw.threats),
  };
}

function mergeSwot(a: StructuredSwot, b: StructuredSwot): StructuredSwot {
  return {
    strengths: a.strengths.length ? a.strengths : b.strengths,
    weaknesses: a.weaknesses.length ? a.weaknesses : b.weaknesses,
    opportunities: a.opportunities.length ? a.opportunities : b.opportunities,
    threats: a.threats.length ? a.threats : b.threats,
  };
}

function parseSummaryField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((p): p is string => typeof p === "string" && Boolean(p.trim()))
      .map((p) => p.trim());
  }
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function looksLikeJsonBlob(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") && (t.includes('"swot"') || t.includes('\\"swot\\"') || t.length > 120);
}

function tryParseEmbeddedJson(s: string): Record<string, unknown> | null {
  const candidates = [s.trim()];
  if (s.includes('\\"') || s.includes("\\n")) {
    candidates.push(s.replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\\\/g, "\\"));
  }
  for (const c of candidates) {
    if (!c.startsWith("{")) continue;
    try {
      const v = JSON.parse(c);
      if (isRecord(v)) return v;
    } catch {
      /* try next */
    }
  }
  return null;
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const k = s.trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function collectNestedParts(data: Record<string, unknown>): {
  swot: StructuredSwot;
  summary: string[];
} {
  let swot = extractSwotFromRecord(data.swot);
  let summary = parseSummaryField(data.summary);

  const nestedRecords: Record<string, unknown>[] = [];
  for (const para of summary) {
    const nested = tryParseEmbeddedJson(para);
    if (nested) nestedRecords.push(nested);
  }
  if (typeof data.summary === "string") {
    const nested = tryParseEmbeddedJson(data.summary);
    if (nested) nestedRecords.push(nested);
  }
  for (const key of ["analysis", "response", "result", "outlet_intelligence"]) {
    const v = data[key];
    if (typeof v === "string") {
      const nested = tryParseEmbeddedJson(v);
      if (nested) nestedRecords.push(nested);
    } else if (isRecord(v)) {
      nestedRecords.push(v);
    }
  }

  for (const nested of nestedRecords) {
    swot = mergeSwot(swot, extractSwotFromRecord(nested.swot));
    summary = [...summary, ...parseSummaryField(nested.summary)];
  }

  const cleanSummary: string[] = [];
  for (const para of summary) {
    if (looksLikeJsonBlob(para)) {
      const nested = tryParseEmbeddedJson(para);
      if (nested) {
        swot = mergeSwot(swot, extractSwotFromRecord(nested.swot));
        for (const p of parseSummaryField(nested.summary)) {
          if (!looksLikeJsonBlob(p)) cleanSummary.push(p);
        }
        continue;
      }
    }
    if (!looksLikeJsonBlob(para)) cleanSummary.push(para);
  }

  return { swot, summary: dedupeStrings(cleanSummary) };
}

/** Repair small-LLM JSON quirks: nested JSON in summary, empty top-level SWOT, double-encoding. */
export function repairStructuredExplanation(input: unknown): StructuredExplanation | null {
  let data = input;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed.startsWith("{")) return null;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!isRecord(data)) return null;

  const record = data;
  if (!isRecord(record.swot) && SWOT_KEYS.some((k) => k in record)) {
    data = {
      swot: {
        strengths: record.strengths,
        weaknesses: record.weaknesses,
        opportunities: record.opportunities,
        threats: record.threats,
      },
      summary: record.summary,
    };
  }

  if (!isRecord(data) || (!isRecord(data.swot) && !("summary" in data))) return null;

  const { swot, summary } = collectNestedParts(data);
  if (!hasSwotContent(swot) && summary.length === 0) return null;

  return { swot, summary };
}

export function parseStructuredExplanation(input: unknown): StructuredExplanation | null {
  return repairStructuredExplanation(input);
}

export function swotSectionToStrings(section: ExplainSwotItem[]): string[] {
  return section.map((i) => i.text);
}

export function structuredToLegacySwot(swot: StructuredSwot): SwotSection {
  return {
    strengths: swotSectionToStrings(swot.strengths),
    weaknesses: swotSectionToStrings(swot.weaknesses),
    opportunities: swotSectionToStrings(swot.opportunities),
    threats: swotSectionToStrings(swot.threats),
  };
}

export function structuredToLegacyText(explanation: StructuredExplanation): string {
  const swot = structuredToLegacySwot(explanation.swot);
  const lines = [
    "SWOT ANALYSIS",
    `Strengths:\n${swot.strengths.map((s) => `- ${s}`).join("\n")}`,
    `Weaknesses:\n${swot.weaknesses.map((s) => `- ${s}`).join("\n")}`,
    `Opportunities:\n${swot.opportunities.map((s) => `- ${s}`).join("\n")}`,
    `Threats:\n${swot.threats.map((s) => `- ${s}`).join("\n")}`,
    "",
    "BUSINESS SUMMARY",
    "",
    ...explanation.summary,
  ];
  return lines.join("\n");
}

/** Parse JSON structured output or fall back to legacy SWOT text format. */
export function parseExplainInput(raw: string): StructuredExplanation | null {
  const structured = repairStructuredExplanation(raw);
  if (structured) return structured;

  if (raw.trim().startsWith("{")) return null;

  const legacy = parseExplanation(raw);
  if (!legacy.swot && !legacy.summary) return null;

  const emptyItems = (): ExplainSwotItem[] => [];
  const toItems = (items: string[]): ExplainSwotItem[] => items.map((text) => ({ text }));

  return {
    swot: {
      strengths: legacy.swot ? toItems(legacy.swot.strengths) : emptyItems(),
      weaknesses: legacy.swot ? toItems(legacy.swot.weaknesses) : emptyItems(),
      opportunities: legacy.swot ? toItems(legacy.swot.opportunities) : emptyItems(),
      threats: legacy.swot ? toItems(legacy.swot.threats) : emptyItems(),
    },
    summary: legacy.summary
      ? legacy.summary.split(/\n\n+/).filter(Boolean).map((p) => p.trim())
      : [],
  };
}

export function stableStringifyExplanation(explanation: StructuredExplanation): string {
  return JSON.stringify(explanation);
}

/** True when an explanation includes at least one non-empty business summary paragraph. */
export function hasBusinessSummary(
  explanation: string | StructuredExplanation | null | undefined
): boolean {
  if (!explanation) return false;
  const structured =
    typeof explanation === "string" ? parseExplainInput(explanation) : explanation;
  return Boolean(structured?.summary?.some((p) => p.trim()));
}

export const EXPLAIN_JSON_SCHEMA = {
  type: "object",
  properties: {
    swot: {
      type: "object",
      properties: {
        strengths: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        weaknesses: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        opportunities: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        threats: { type: "array", items: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
      },
      required: ["strengths", "weaknesses", "opportunities", "threats"],
    },
    summary: { type: "array", items: { type: "string" } },
  },
  required: ["swot", "summary"],
} as const;

export const EXPLAIN_JSON_INSTRUCTION =
  "Return ONE JSON object only. Do NOT nest JSON inside summary strings. " +
  "Schema: {\"swot\":{\"strengths\":[{\"text\":\"...\"}],\"weaknesses\":[...],\"opportunities\":[...],\"threats\":[...]},\"summary\":[\"paragraph 1\",\"paragraph 2\"]}. " +
  "Put SWOT bullets inside swot.strengths/weaknesses/opportunities/threats — each item needs a \"text\" field. " +
  "Put 1-2 plain-text paragraphs in summary (not JSON). Use 2-4 items per SWOT quadrant. " +
  "Wrap key numbers in **double asterisks** inside text fields. Use ONLY provided outlet data. No preamble.";
