import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "error" | "warning" | "info" | "success";

type Props = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  variant?: Variant;
};

const variants: Record<Variant, string> = {
  error: "border-semantic-error/30 bg-semantic-error-bg text-red-900",
  warning: "border-semantic-warning/30 bg-semantic-warning-bg text-amber-900",
  info: "border-semantic-info/30 bg-semantic-info-bg text-blue-900",
  success: "border-semantic-success/30 bg-semantic-success-bg text-emerald-900",
};

export function Alert({ className, title, variant = "error", children, ...props }: Props) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border px-4 py-3", variants[variant], className)}
      {...props}
    >
      {title && <strong className="block text-sm font-semibold">{title}</strong>}
      <div className={cn("text-sm", title && "mt-1")}>{children}</div>
    </div>
  );
}
