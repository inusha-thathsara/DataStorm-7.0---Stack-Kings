import { cn } from "@/lib/utils";

type Accent = "default" | "emerald" | "blue" | "highlight";

type Props = {
  label: string;
  value: string;
  hint?: string;
  accent?: Accent;
  /** Dark banner variant (OptimizationBanner) */
  variant?: "dark" | "light";
  highlight?: boolean;
};

const lightAccent: Record<Accent, string> = {
  default: "text-text-primary",
  emerald: "text-brand-accent",
  blue: "text-semantic-info",
  highlight: "text-brand-accent",
};

export function Stat({ label, value, hint, accent = "default", variant = "dark", highlight }: Props) {
  const isDark = variant === "dark";

  if (isDark) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <p
          className={cn(
            "mt-1 text-base font-bold tabular-nums sm:text-lg",
            highlight ? "text-emerald-300" : "text-white"
          )}
        >
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-[120px] flex-1 px-4 py-3 first:pl-0 last:pr-0 md:border-r md:border-border md:last:border-r-0">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", lightAccent[accent])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
