import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";

const STEPS = ["Dates", "Extras", "Driver", "Payment"] as const;

export function BookingSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Booking progress" className="no-print mb-6">
      <ol className="flex items-center gap-2 text-sm">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className="flex flex-1 items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done && "bg-brand-700 text-white",
                  active && "bg-accent-400 text-ink-900",
                  !done && !active && "bg-ink-200 text-ink-600",
                )}
              >
                {done ? <CheckIcon className="size-4" /> : n}
              </span>
              <span className={cn("hidden sm:inline", active ? "font-semibold text-ink-900" : "text-ink-600")}>
                {label}
                {done ? <span className="sr-only"> (completed)</span> : null}
              </span>
              {n < STEPS.length ? <span className="h-px flex-1 bg-ink-200" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
