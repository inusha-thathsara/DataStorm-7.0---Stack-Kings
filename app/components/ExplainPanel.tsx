import { Badge, explainSourceTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
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
    <div className="mt-6">
      <Button
        variant="primary"
        onClick={onExplain}
        disabled={loading}
        className="min-w-[180px]"
      >
        {loading ? "Generating… (Ollama may take 60–120s)" : "Explain this outlet"}
      </Button>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {warning && !error && (
        <p className="mt-3 text-sm text-amber-800" role="status">
          {warning}
        </p>
      )}

      {explanation && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row flex-wrap items-center gap-2">
            <CardTitle className="mb-0">Business explanation</CardTitle>
            <Badge tone={explainSourceTone(source)}>{explainSourceLabel(source)}</Badge>
            {source === "ollama" && meta && (
              <span className="text-xs text-slate-500">{formatExplainMeta(meta)}</span>
            )}
            {source === "template" && (
              <span className="text-xs text-slate-400">No LLM inference ran</span>
            )}
          </CardHeader>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {explanation}
          </p>
        </Card>
      )}
    </div>
  );
}
