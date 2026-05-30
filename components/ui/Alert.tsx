import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Props = HTMLAttributes<HTMLDivElement> & {
  title?: string;
};

export function Alert({ className, title, children, ...props }: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900",
        className
      )}
      {...props}
    >
      {title && <strong className="block text-sm font-semibold">{title}</strong>}
      <div className={cn("text-sm", title && "mt-1")}>{children}</div>
    </div>
  );
}
