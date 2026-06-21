import { ExplainContent } from "@/components/ExplainContent";
import { ShareActions } from "@/components/ShareActions";
import { Badge, explainSourceTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader, CardTitle, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { downloadMarkdown, toMarkdown } from "@/lib/exportExplanation";
import type { ExplainErrorCode } from "@/lib/explainErrors";
import { parseExplainInput, hasBusinessSummary, type ExplainSwotItem, type StructuredExplanation } from "@/lib/explainSchema";
import { explainSourceLabel, formatExplainMeta } from "@/lib/xai";
import type { ExplainMeta, ExplainSource, Outlet } from "@/lib/types";

type Props = {
  loading: boolean;
  explanation: string | StructuredExplanation;
  source: ExplainSource;
  outlet?: Outlet | null;
  meta?: ExplainMeta | null;
  warning?: string | null;
  error?: string | null;
  errorCode?: ExplainErrorCode | null;
  cached?: boolean;
  onExplain: () => void;
  onRefClick?: (item: ExplainSwotItem) => void;
};

export function ExplainPanel({
  loading,
  explanation,
  source,
  outlet,
  meta,
  warning,
  error,
  errorCode,
  cached,
  onExplain,
  onRefClick,
}: Props) {
  const hasContent =
    typeof explanation === "string" ? explanation.trim().length > 0 : Boolean(explanation);

  const structured =
    typeof explanation === "string" ? parseExplainInput(explanation) : explanation;

  function handleExportMarkdown() {
    if (!outlet || !structured) return;
    const md = toMarkdown(outlet, structured, source);
    downloadMarkdown(`${outlet.id}-intelligence.md`, md);
  }

  return (
    <Card className="mt-8 overflow-hidden p-0 shadow-card print-area">
      <PanelHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PanelHeaderTitle className="normal-case tracking-normal text-base text-text-primary">
            Explainable AI
          </PanelHeaderTitle>
          <p className="mt-0.5 text-xs text-text-muted">
            SWOT analysis and highlighted business summary from pipeline data only
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          {hasBusinessSummary(explanation) && structured && outlet && (
            <Button type="button" variant="outline" size="sm" onClick={handleExportMarkdown}>
              Export Markdown
            </Button>
          )}
          <ShareActions />
          <Button
            variant="primary"
            size="md"
            onClick={onExplain}
            disabled={loading}
            aria-busy={loading}
            className="min-w-[200px] shadow-sm shadow-emerald-900/10"
          >
            {loading ? "Generating SWOT & summary…" : "Explain this outlet"}
          </Button>
        </div>
      </PanelHeader>

      <div className="space-y-4 p-4">
        {error && (
          <Alert variant="error" title="Could not generate explanation">
            {error}
            {errorCode && (
              <p className="mt-1 text-xs opacity-80">Code: {errorCode}</p>
            )}
          </Alert>
        )}

        {warning && !error && (
          <Alert variant="warning" title={source === "template" ? "Pipeline template used" : "Fallback used"}>
            {warning}
          </Alert>
        )}

        {hasContent && (
          <Card className="border-border/80 shadow-card">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b border-border-muted pb-3">
              <CardTitle className="mb-0 text-sm">Outlet intelligence</CardTitle>
              <Badge tone={explainSourceTone(source)}>{explainSourceLabel(source)}</Badge>
              {cached && <Badge tone="muted">Cached</Badge>}
              {source === "ollama" && meta && (
                <span className="text-xs text-text-muted">{formatExplainMeta(meta)}</span>
              )}
              {source === "template" && (
                <span className="text-xs text-text-muted">Deterministic pipeline fallback</span>
              )}
            </CardHeader>
            <ExplainContent explanation={explanation} onRefClick={onRefClick} />
          </Card>
        )}
      </div>
    </Card>
  );
}
