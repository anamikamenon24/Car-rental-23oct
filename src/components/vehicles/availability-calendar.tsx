import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";

export type AvailabilityDay = { date: string; status: "AVAILABLE" | "BOOKED" | "MAINTENANCE" | "PARTIAL" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const statusStyles: Record<AvailabilityDay["status"], string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-900 ring-amber-200",
  BOOKED: "bg-red-50 text-red-800 ring-red-200 line-through decoration-red-300",
  MAINTENANCE: "bg-ink-100 text-ink-500 ring-ink-200 line-through",
};

const statusLabel: Record<AvailabilityDay["status"], string> = {
  AVAILABLE: "available",
  PARTIAL: "partly booked",
  BOOKED: "booked",
  MAINTENANCE: "unavailable (maintenance)",
};

/**
 * Month grid of per-day availability from the server (dates are in the branch's time zone).
 * `month` is "YYYY-MM"; prev/next links keep the rest of the page's query string.
 */
export function AvailabilityCalendar({
  month,
  days,
  today,
  prevHref,
  nextHref,
  timeZoneLabel,
  selectedFrom,
  selectedTo,
}: {
  month: string;
  days: AvailabilityDay[];
  today: string;
  prevHref: string | null;
  nextHref: string | null;
  timeZoneLabel: string;
  selectedFrom?: string;
  selectedTo?: string;
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7; // Monday-first
  const byDate = new Map(days.map((d) => [d.date, d.status]));
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${month}-${String(d).padStart(2, "0")}`, day: d });
  }

  return (
    <section aria-labelledby="availability-title" data-testid="availability-calendar" data-month={month}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="availability-title" className="text-base font-semibold text-ink-900">
          Availability · <span className="font-normal">{title}</span>
        </h2>
        <div className="flex items-center gap-1">
          {prevHref ? (
            <Link
              href={prevHref}
              scroll={false}
              className="rounded-lg p-2 text-ink-700 hover:bg-ink-100"
              aria-label="Previous month"
              data-testid="calendar-prev"
            >
              <ChevronLeftIcon className="size-4" />
            </Link>
          ) : (
            <span className="p-2 text-ink-300" aria-hidden="true">
              <ChevronLeftIcon className="size-4" />
            </span>
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              scroll={false}
              className="rounded-lg p-2 text-ink-700 hover:bg-ink-100"
              aria-label="Next month"
              data-testid="calendar-next"
            >
              <ChevronRightIcon className="size-4" />
            </Link>
          ) : (
            <span className="p-2 text-ink-300" aria-hidden="true">
              <ChevronRightIcon className="size-4" />
            </span>
          )}
        </div>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">Dates in {timeZoneLabel}.</p>

      <div role="grid" aria-label={`Availability for ${title}`} className="mt-3">
        <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ink-500">
          {WEEKDAYS.map((d) => (
            <div role="columnheader" key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
          <div role="row" key={row} className="mt-1 grid grid-cols-7 gap-1">
            {cells.slice(row * 7, row * 7 + 7).map((cell, i) => {
              if (!cell) return <div role="gridcell" key={`e${i}`} aria-hidden="true" />;
              const past = cell.date < today;
              const status = byDate.get(cell.date);
              const selected =
                selectedFrom && selectedTo ? cell.date >= selectedFrom && cell.date <= selectedTo : false;
              const label = past
                ? "past"
                : status
                  ? statusLabel[status]
                  : "no data";
              return (
                <div
                  role="gridcell"
                  key={cell.date}
                  data-date={cell.date}
                  data-available={!past && status === "AVAILABLE" ? "true" : "false"}
                  data-status={past ? "PAST" : (status ?? "UNKNOWN")}
                  aria-label={`${cell.day} ${title}: ${label}${selected ? ", in your selected dates" : ""}`}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg text-sm ring-1 ring-inset",
                    past || !status ? "bg-white text-ink-300 ring-ink-100" : statusStyles[status],
                    selected && "outline-2 outline-offset-1 outline-brand-500",
                  )}
                >
                  {cell.day}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        <Legend className="bg-emerald-100 ring-emerald-300" label="Available" />
        <Legend className="bg-amber-100 ring-amber-300" label="Partly booked" />
        <Legend className="bg-red-100 ring-red-300" label="Booked" />
        <Legend className="bg-ink-200 ring-ink-300" label="Maintenance" />
      </ul>
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={cn("size-3 rounded ring-1 ring-inset", className)} aria-hidden="true" />
      {label}
    </li>
  );
}
