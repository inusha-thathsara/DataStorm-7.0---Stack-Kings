import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-accent text-text-inverse hover:bg-brand-accent-hover focus-visible:ring-brand-accent disabled:bg-emerald-300",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-muted focus-visible:ring-slate-400 disabled:text-text-muted",
  outline:
    "border border-border bg-surface-card text-text-secondary hover:bg-surface-muted focus-visible:ring-slate-400 disabled:border-border-muted disabled:text-text-muted",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-6 text-base",
};

export function Button({ className, variant = "outline", size = "md", ...props }: Props) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
