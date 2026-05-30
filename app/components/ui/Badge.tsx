import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone = "default" | "success" | "warning" | "info" | "muted";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
};

const tones: Record<Tone, string> = {
  default: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-900",
  info: "bg-blue-100 text-blue-800",
  muted: "bg-slate-50 text-slate-500 border border-slate-200",
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
