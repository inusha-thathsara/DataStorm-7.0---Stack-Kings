import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200",
        className
      )}
      {...props}
    />
  );
}

export function TableRowSkeleton({ cols = 7 }: { cols?: number }) {
  return (
    <tr className="border-b border-border-muted">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface-card py-16 shadow-card">
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-slate-200 border-t-brand-accent" />
      </div>
      <p className="mt-4 max-w-md text-center text-sm text-text-secondary">{message}</p>
      <div className="mt-6 w-full max-w-lg space-y-2 px-8">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5 mx-auto" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
