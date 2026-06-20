import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-border bg-surface-card px-3 text-sm text-text-primary",
        "placeholder:text-text-muted",
        "focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/20",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
