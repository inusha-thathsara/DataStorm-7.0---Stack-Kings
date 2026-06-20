import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Props = {
  page: number;
  totalPages: number;
  pageSize?: number;
  totalItems?: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function Pagination({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPrevious,
  onNext,
}: Props) {
  const rangeLabel =
    pageSize !== undefined && totalItems !== undefined && totalItems > 0
      ? (() => {
          const start = page * pageSize + 1;
          const end = Math.min((page + 1) * pageSize, totalItems);
          return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${totalItems.toLocaleString()}`;
        })()
      : null;

  return (
    <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-card">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrevious}>
        ← Previous
      </Button>
      <div className="text-center">
        {rangeLabel && (
          <p className="text-xs text-text-muted">{rangeLabel}</p>
        )}
        <p className="text-sm tabular-nums text-text-secondary">
          Page <span className="font-semibold text-text-primary">{page + 1}</span> of {totalPages}
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
        Next →
      </Button>
    </Card>
  );
}
