import {
  parseExplanation,
  splitHighlightedText,
  type SwotSection,
} from "@/lib/explainFormat";

const SWOT_META: {
  key: keyof SwotSection;
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

function SwotGrid({ swot }: { swot: SwotSection }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SWOT_META.map(({ key, title, tone }) => (
        <div
          key={key}
          className={`rounded-lg border-l-4 p-3 ${tone}`}
        >
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-primary">
            {title}
          </h4>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-text-secondary">
            {swot[key].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
                <span>
                  <HighlightedText text={item} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type Props = {
  explanation: string;
};

export function ExplainContent({ explanation }: Props) {
  const { swot, summary } = parseExplanation(explanation);
  const summaryParagraphs = summary.split(/\n\n+/).filter(Boolean);

  return (
    <div className="space-y-5 pt-1">
      {swot && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            SWOT analysis
          </h4>
          <SwotGrid swot={swot} />
        </div>
      )}

      {summaryParagraphs.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Business summary
          </h4>
          <div className="space-y-3">
            {summaryParagraphs.map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-text-secondary">
                <HighlightedText text={para.trim()} />
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
