import { Button } from "@/components/ui/Button";

type Props = {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function Pagination({ page, totalPages, onPrevious, onNext }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={page === 0} onClick={onPrevious}>
        Previous
      </Button>
      <span className="text-sm text-slate-600">
        Page {page + 1} / {totalPages}
      </span>
      <Button variant="outline" disabled={page >= totalPages - 1} onClick={onNext}>
        Next
      </Button>
    </div>
  );
}
