import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center",
        className,
      )}
      {...rest}
    >
      {icon ? <div className="mb-3 rounded-full bg-brand-50 p-3 text-brand-700">{icon}</div> : null}
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-600">{description}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
