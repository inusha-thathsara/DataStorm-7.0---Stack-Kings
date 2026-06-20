import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-md border border-border bg-surface-card px-3 text-sm text-text-primary",
        "focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
