import type { StructuredExplanation } from "./explainSchema";
import type { ExplainSource, Outlet } from "./types";

function swotSection(title: string, items: { text: string }[]): string {
  if (!items.length) return "";
  return `### ${title}\n${items.map((i) => `- ${i.text.replace(/\*\*/g, "")}`).join("\n")}`;
}

export function toMarkdown(
  outlet: Outlet,
  explanation: StructuredExplanation,
  source: ExplainSource,
  generatedAt?: string
): string {
  const lines = [
    `# Outlet intelligence — ${outlet.id}`,
    "",
    `- Province: ${outlet.province}`,
    `- Distributor: ${outlet.distributorId}`,
    `- Predicted Jan 2026: **${outlet.predictedLiters.toFixed(1)} L**`,
    `- Gap: **${outlet.gapLiters.toFixed(1)} L**`,
    `- Trade spend: ${outlet.tradeSpendLkr > 0 ? `LKR ${outlet.tradeSpendLkr.toLocaleString()}` : "—"}`,
    `- Source: ${source}`,
    generatedAt ? `- Generated: ${generatedAt}` : "",
    "",
    "## SWOT analysis",
    "",
    swotSection("Strengths", explanation.swot.strengths),
    "",
    swotSection("Weaknesses", explanation.swot.weaknesses),
    "",
    swotSection("Opportunities", explanation.swot.opportunities),
    "",
    swotSection("Threats", explanation.swot.threats),
    "",
    "## Business summary",
    "",
    ...explanation.summary,
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyPageLink(): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.clipboard) return false;
  await navigator.clipboard.writeText(window.location.href);
  return true;
}

export function printPage(): void {
  if (typeof window === "undefined") return;
  window.print();
}
