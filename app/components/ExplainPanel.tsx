import { ExplainContent } from "@/components/ExplainContent";
import { Badge, explainSourceTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader, CardTitle, PanelHeader, PanelHeaderTitle } from "@/components/ui/Card";
import { explainSourceLabel, formatExplainMeta } from "@/lib/xai";
import type { ExplainMeta, ExplainSource } from "@/lib/types";

type Props = {
  loading: boolean;
  explanation: string;
  source: ExplainSource;
  meta?: ExplainMeta | null;
  warning?: string | null;
  error: string | null;
  onExplain: () => void;
};

export function ExplainPanel({
  loading,
  explanation,
  source,
  meta,
  warning,
  error,
  onExplain,
}: Props) {
  return (
    <Card className="mt-8 overflow-hidden p-0 shadow-card">
      <PanelHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <PanelHeaderTitle className="normal-case tracking-normal text-base text-text-primary">
            Explainable AI
          </PanelHeaderTitle>
          <p className="mt-0.5 text-xs text-text-muted">
            SWOT analysis and highlighted business summary from pipeline data only
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={onExplain}
          disabled={loading}
          className="min-w-[200px] shadow-sm shadow-emerald-900/10"
        >
          {loading ? "Generating SWOT & summary…" : "Explain this outlet"}
        </Button>
      </PanelHeader>

      <div className="space-y-4 p-4">
        {error && <Alert variant="error">{error}</Alert>}

        {warning && !error && <Alert variant="warning">{warning}</Alert>}

        {explanation && (
          <Card className="border-border/80 shadow-card">
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b border-border-muted pb-3">
              <CardTitle className="mb-0 text-sm">Outlet intelligence</CardTitle>
              <Badge tone={explainSourceTone(source)}>{explainSourceLabel(source)}</Badge>
              {source === "ollama" && meta && (
                <span className="text-xs text-text-muted">{formatExplainMeta(meta)}</span>
              )}
              {source === "template" && (
                <span className="text-xs text-text-muted">Deterministic fallback</span>
              )}
            </CardHeader>
            <ExplainContent explanation={explanation} />
          </Card>
        )}
      </div>
    </Card>
  );
}
