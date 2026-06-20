import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone = "default" | "success" | "warning" | "info" | "muted";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

const tones: Record<Tone, string> = {
  default: "bg-surface-muted text-text-secondary",
  success: "bg-semantic-success-bg text-emerald-800",
  warning: "bg-semantic-warning-bg text-amber-900",
  info: "bg-semantic-info-bg text-blue-800",
  muted: "bg-surface-card text-text-muted border border-border",
};

export function Badge({ className, tone = "default", ...props }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function saturationTone(
  saturation: string | undefined
): "warning" | "success" | "default" {
  const s = (saturation || "").toLowerCase();
  if (s === "high") return "warning";
  if (s === "low") return "success";
  return "default";
}

export function explainSourceTone(
  source: string
): "info" | "success" | "muted" {
  if (source === "ollama") return "info";
  if (source === "gemini") return "success";
  return "muted";
}
