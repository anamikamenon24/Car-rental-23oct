import type { RawSearchParams } from "@/lib/ui/search-params";

const MONTH_RE = /^\d{4}-\d{2}$/;
const MAX_MONTHS_AHEAD = 12;

function shift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Month navigation for availability calendars. `requested` is the ?month= value, `anchor` the
 * date to show by default (trip start or today), `today` the branch-local date. Returned hrefs
 * are query strings that keep every other search param.
 */
export function monthNav(requested: string | undefined, anchor: string, today: string, sp: RawSearchParams) {
  const current = today.slice(0, 7);
  const last = shift(current, MAX_MONTHS_AHEAD);
  let month = requested && MONTH_RE.test(requested) ? requested : anchor.slice(0, 7);
  if (month < current) month = current;
  if (month > last) month = last;

  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const href = (target: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "month" || v === undefined) continue;
      q.set(k, Array.isArray(v) ? (v[0] ?? "") : v);
    }
    q.set("month", target);
    return `?${q.toString()}`;
  };

  return {
    month,
    fromDate: `${month}-01`,
    days,
    prevHref: month > current ? href(shift(month, -1)) : null,
    nextHref: month < last ? href(shift(month, 1)) : null,
  };
}
