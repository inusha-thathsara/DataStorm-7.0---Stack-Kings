import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export function Card({ className, interactive, ...props }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-surface-card p-4 shadow-card",
        interactive && "transition-shadow hover:shadow-md",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-base font-semibold text-text-primary", className)} {...props} />
  );
}

export function PanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-header", className)} {...props} />;
}

export function PanelHeaderTitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("panel-header-title", className)} {...props} />;
}
