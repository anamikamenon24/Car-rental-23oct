// Conversions between UTC instants and wall-clock "YYYY-MM-DDTHH:mm" strings in a
// branch's IANA time zone. Used to fill <input type="datetime-local"> and to read it back.

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isLocalDateTime(value: unknown): value is string {
  return typeof value === "string" && LOCAL_RE.test(value);
}

function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset of `timeZone` from UTC at instant `date`, in minutes. */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "2026-10-24T10:00" in `timeZone` -> UTC Date. Returns null for malformed input. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes handle zones with DST; UAE has none but other branches might.
  let ts = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  ts = guess - offsetMinutes(new Date(ts), timeZone) * 60000;
  return new Date(ts);
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" wall clock in `timeZone`. */
export function utcToZonedLocal(value: Date | string, timeZone: string): string {
  const p = partsIn(value instanceof Date ? value : new Date(value), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** UTC instant -> "YYYY-MM-DD" calendar date in `timeZone`. */
export function utcToZonedDate(value: Date | string, timeZone: string): string {
  return utcToZonedLocal(value, timeZone).slice(0, 10);
}

/** Adds whole days to a "YYYY-MM-DD" string (calendar arithmetic, zone-free). */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
