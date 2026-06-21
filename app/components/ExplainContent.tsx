import {
  parseExplainInput,
  type ExplainSwotItem,
  type StructuredExplanation,
} from "@/lib/explainSchema";
import { splitHighlightedText } from "@/lib/explainFormat";

const SWOT_META: {
  key: keyof StructuredExplanation["swot"];
  title: string;
  tone: string;
}[] = [
  { key: "strengths", title: "Strengths", tone: "border-emerald-500 bg-emerald-50/80" },
  { key: "weaknesses", title: "Weaknesses", tone: "border-amber-500 bg-amber-50/80" },
  { key: "opportunities", title: "Opportunities", tone: "border-sky-500 bg-sky-50/80" },
  { key: "threats", title: "Threats", tone: "border-rose-500 bg-rose-50/80" },
];

function HighlightedText({ text }: { text: string }) {
  const parts = splitHighlightedText(text);
  return (
    <>
      {parts.map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold text-text-primary">
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

function SwotItemLine({
  item,
  onRefClick,
}: {
  item: ExplainSwotItem;
  onRefClick?: (item: ExplainSwotItem) => void;
}) {
  const clickable = Boolean(onRefClick && item.refs?.length);
  const content = <HighlightedText text={item.text} />;

  if (!clickable) {
    return <span>{content}</span>;
  }

  return (
    <button
      type="button"
      className="text-left underline decoration-dotted underline-offset-2 hover:text-brand-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-1"
      onClick={() => onRefClick?.(item)}
      title="Show related chart metric"
    >
      {content}
    </button>
  );
}

function normalizeInput(input: string | StructuredExplanation): StructuredExplanation | null {
  if (typeof input !== "string") return input;
  return parseExplainInput(input);
}

type Props = {
  explanation: string | StructuredExplanation;
  onRefClick?: (item: ExplainSwotItem) => void;
};

export function ExplainContent({ explanation, onRefClick }: Props) {
  const structured = normalizeInput(explanation);
  if (!structured) return null;

  const summaryParagraphs = structured.summary.filter(Boolean);
  const hasSwot = SWOT_META.some(({ key }) => structured.swot[key].length > 0);

  return (
    <div className="space-y-5 pt-1">
      {hasSwot && (
        <div>
          <h4 id="swot-heading" className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            SWOT analysis
          </h4>
          <section aria-labelledby="swot-heading" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SWOT_META.map(({ key, title, tone }) => (
              <div key={key} className={`rounded-lg border-l-4 p-3 ${tone}`}>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-text-primary">{title}</h4>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-text-secondary">
                  {structured.swot[key].map((item, i) => (
                    <li key={`${key}-${i}`} className="flex gap-2">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-50"
                        aria-hidden
                      />
                      <SwotItemLine item={item} onRefClick={onRefClick} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}

      {summaryParagraphs.length > 0 && (
        <section aria-labelledby="summary-heading">
          <h4
            id="summary-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Business summary
          </h4>
          <div className="space-y-3">
            {summaryParagraphs.map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-text-secondary">
                <HighlightedText text={para.trim()} />
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
