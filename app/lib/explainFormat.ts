import type { Outlet, QrFeatureDriver } from "./types";

export type SwotSection = {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
};

export type ParsedExplanation = {
  swot: SwotSection | null;
  summary: string;
};

const SWOT_HEADERS = ["Strengths", "Weaknesses", "Opportunities", "Threats"] as const;
type SwotKey = Lowercase<(typeof SWOT_HEADERS)[number]>;

const HEADER_TO_KEY: Record<string, SwotKey> = {
  strengths: "strengths",
  weaknesses: "weaknesses",
  opportunities: "opportunities",
  threats: "threats",
};

function parseBulletLines(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

function parseSwotBlock(block: string): SwotSection {
  const swot: SwotSection = {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
  };

  const lines = block.split("\n");
  let current: SwotKey | null = null;
  const buffers: Record<SwotKey, string[]> = {
    strengths: [],
    weaknesses: [],
    opportunities: [],
    threats: [],
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const header = line
      .replace(/^[-•*]\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/:$/, "")
      .trim()
      .toLowerCase();
    if (header in HEADER_TO_KEY) {
      current = HEADER_TO_KEY[header];
      continue;
    }
    if (current) {
      buffers[current].push(line.replace(/^[-•*]\s*/, "").trim());
    }
  }

  for (const key of Object.keys(buffers) as SwotKey[]) {
    swot[key] = buffers[key].filter(Boolean);
  }

  return swot;
}

function hasSwotContent(swot: SwotSection): boolean {
  return (
    swot.strengths.length +
      swot.weaknesses.length +
      swot.opportunities.length +
      swot.threats.length >
    0
  );
}

function findSectionIndex(text: string, heading: string): number {
  const re = new RegExp(`^${heading}\\s*:?\\s*$`, "im");
  const match = re.exec(text);
  return match ? match.index : -1;
}

function findLastSectionIndex(text: string, heading: string, after = 0): number {
  const re = new RegExp(`^${heading}\\s*:?\\s*$`, "gim");
  let last = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index >= after) last = match.index;
  }
  return last;
}

function sectionContentEnd(
  text: string,
  sectionStart: number,
  otherSectionIdx: number
): number {
  if (otherSectionIdx >= 0 && otherSectionIdx > sectionStart) return otherSectionIdx;
  return text.length;
}

/** Drop conversational LLM filler and SWOT lines that leak into the summary block. */
function stripSummaryPreamble(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (kept.length > 0 && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }

    if (/^SWOT ANALYSIS\s*:?\s*$/i.test(line)) break;
    if (/^(BUSINESS SUMMARY|Strengths|Weaknesses|Opportunities|Threats)\s*:?\s*$/i.test(line)) {
      continue;
    }
    if (
      /^(okay[,.]?\s*)?(here'?s|below is|following is|sure[,.]?|certainly[,.]?|of course[,.]?)/i.test(
        line
      )
    ) {
      continue;
    }
    if (
      /based (solely )?on the provided/i.test(line) ||
      /formatted as requested/i.test(line) ||
      /as requested[,.]?\s*$/i.test(line)
    ) {
      continue;
    }
    if (/^[-•*]\s*\*?\*?(Strengths|Weaknesses|Opportunities|Threats)\*?\*?\s*:?/i.test(line)) {
      continue;
    }

    kept.push(raw);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseExplanation(text: string): ParsedExplanation {
  const trimmed = text.trim();
  if (!trimmed) return { swot: null, summary: "" };

  const normalized = trimmed.replace(/^#+\s*/gm, "");
  const swotIdx = findSectionIndex(normalized, "SWOT ANALYSIS");
  const businessIdx = findSectionIndex(normalized, "BUSINESS SUMMARY");

  let swot: SwotSection | null = null;
  let summary = "";

  if (swotIdx >= 0) {
    const swotStart = swotIdx + normalized.slice(swotIdx).match(/^SWOT ANALYSIS\s*:?/i)![0].length;
    const swotEnd =
      businessIdx >= 0 && businessIdx > swotIdx ? businessIdx : normalized.length;
    const parsed = parseSwotBlock(normalized.slice(swotStart, swotEnd).trim());
    if (hasSwotContent(parsed)) swot = parsed;
  }

  if (businessIdx >= 0) {
    let summaryIdx = -1;
    if (swotIdx >= 0) {
      summaryIdx = findLastSectionIndex(normalized, "BUSINESS SUMMARY", swotIdx);
    }
    if (summaryIdx < 0) {
      summaryIdx = findLastSectionIndex(normalized, "BUSINESS SUMMARY");
    }
    if (summaryIdx >= 0) {
      const headingMatch = normalized.slice(summaryIdx).match(/^BUSINESS SUMMARY\s*:?/i);
      if (headingMatch) {
        const businessStart = summaryIdx + headingMatch[0].length;
        const businessEnd = sectionContentEnd(
          normalized,
          summaryIdx,
          swotIdx > summaryIdx ? swotIdx : -1
        );
        summary = stripSummaryPreamble(normalized.slice(businessStart, businessEnd).trim());
      }
    }
  }

  if (!swot && !summary) {
    return { swot: null, summary: trimmed };
  }

  return { swot, summary };
}

export function buildSwotFromOutlet(outlet: Outlet): SwotSection {
  const md = outlet.modelDrivers;
  const qr = md?.qrTopDrivers ?? [];
  const comp = md?.competition;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  if (outlet.gapLiters > 100) {
    strengths.push(`Untapped volume gap of **${outlet.gapLiters.toFixed(1)} L** vs historical max`);
    opportunities.push(`Close **${outlet.gapLiters.toFixed(1)} L** latent gap with targeted trade spend`);
  }
  if (outlet.predictedLiters > outlet.ownMaxVol) {
    strengths.push(
      `Predicted potential **${outlet.predictedLiters.toFixed(1)} L** exceeds historical max **${outlet.ownMaxVol.toFixed(1)} L**`
    );
  }
  if (outlet.decayTransport > 2) strengths.push("Strong transport POI footfall in catchment");
  if (outlet.decayFood > 1) strengths.push("Food-service POI proximity supports impulse demand");
  if (outlet.coolerCount >= 3) strengths.push(`**${outlet.coolerCount}** on-premise coolers — good display capacity`);
  if (outlet.janFactor > 1.05 || outlet.seasonalityLabel === "Favorable") {
    strengths.push(`Favorable January seasonality (factor **${outlet.janFactor.toFixed(3)}**)`);
  }

  for (const d of qr.filter((x) => x.direction === "up").slice(0, 2)) {
    strengths.push(`${d.label} (+${d.contributionLiters.toFixed(1)} L model contribution)`);
  }
  for (const d of qr.filter((x) => x.direction === "down").slice(0, 2)) {
    weaknesses.push(`${d.label} (${d.contributionLiters.toFixed(1)} L model drag)`);
  }

  if (outlet.marketSaturation === "high") {
    weaknesses.push("High local market saturation");
    threats.push("Intense competitor density erodes share-of-throat");
  }
  if (outlet.adjustmentFactor < 0.95) {
    weaknesses.push(`Competition penalty (×${outlet.adjustmentFactor.toFixed(3)}) applied to ceiling`);
  }
  if (outlet.coolerCount === 0) weaknesses.push("No on-premise cooler — limited cold-chain visibility");
  if (outlet.seasonalityLabel === "Un-Favorable") threats.push("Unfavorable January seasonality headwind");

  if (comp && comp.saturationPenalty < 0.98) {
    threats.push(`Saturation penalty ×${comp.saturationPenalty.toFixed(3)} in competitive catchment`);
  }

  if (outlet.tradeSpendLkr > 0) {
    opportunities.push(
      `Western Province trade allocation **LKR ${outlet.tradeSpendLkr.toLocaleString()}**` +
        (outlet.predictedIncrementalLiters > 0
          ? ` → modeled **+${outlet.predictedIncrementalLiters.toFixed(1)} L** incremental`
          : "")
    );
  }
  if (outlet.clusterCeiling > outlet.predictedLiters) {
    opportunities.push(
      `Peer cluster **${outlet.clusterId || "n/a"}** ceiling **${outlet.clusterCeiling.toFixed(1)} L** — room to grow vs cluster peers`
    );
  }

  const fill = (arr: string[], fallback: string) => {
    if (!arr.length) arr.push(fallback);
  };
  fill(strengths, "Stable baseline volume from historical trading pattern");
  fill(weaknesses, "No major structural weaknesses flagged in pipeline features");
  fill(opportunities, "Maintain current service levels and monitor gap vs predicted potential");
  fill(threats, "Monitor competitor activity in catchment");

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    threats: threats.slice(0, 4),
  };
}

function formatSwotSection(title: string, items: string[]): string {
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function formatSwotText(swot: SwotSection): string {
  return [
    "SWOT ANALYSIS",
    formatSwotSection("Strengths", swot.strengths),
    formatSwotSection("Weaknesses", swot.weaknesses),
    formatSwotSection("Opportunities", swot.opportunities),
    formatSwotSection("Threats", swot.threats),
  ].join("\n\n");
}

/** Split text on **bold** markers for React rendering. */
export function splitHighlightedText(text: string): Array<{ bold: boolean; text: string }> {
  const parts: Array<{ bold: boolean; text: string }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ bold: false, text: text.slice(last, match.index) });
    }
    parts.push({ bold: true, text: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ bold: false, text: text.slice(last) });
  }
  return parts.length ? parts : [{ bold: false, text }];
}

export function topQrDrivers(qr: QrFeatureDriver[] | undefined, n = 2): string {
  if (!qr?.length) return "";
  return qr
    .slice(0, n)
    .map((d) => `${d.label} (${d.contributionLiters > 0 ? "+" : ""}${d.contributionLiters.toFixed(1)} L)`)
    .join("; ");
}
