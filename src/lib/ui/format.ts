// Display formatting shared by server and client components. Pure functions only:
// no authoritative calculations happen here, we only render numbers the server gave us.

const aed = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer fils (1 AED = 100 fils) to "AED 1,234.50". */
export function formatAED(fils: number | null | undefined): string {
  if (fils === null || fils === undefined || !Number.isFinite(fils)) return "—";
  // Intl renders "AED 1,234.50" (with a non-breaking space) for en-AE.
  return aed.format(fils / 100);
}

/** Whole-dirham display for compact places like cards ("AED 189"). */
export function formatAEDShort(fils: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(fils / 100));
}

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "Fri, 24 Oct 2026, 10:00" in the given IANA zone. */
export function formatDateTime(value: DateInput, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(toDate(value));
}

/** "24 Oct 2026" in the given IANA zone. */
export function formatDate(value: DateInput, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(toDate(value));
}

/** "10:00" in the given IANA zone. */
export function formatTime(value: DateInput, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(toDate(value));
}

/** Short zone label, e.g. "GST" / "GMT+4", to put next to times. */
export function zoneLabel(timeZone: string, at: DateInput = 0): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" }).formatToParts(
    toDate(at),
  );
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return "—";
  return `${new Intl.NumberFormat("en-AE").format(km)} km`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** "MANUAL" -> "Manual", "PLUG_IN_HYBRID" -> "Plug in hybrid". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const s = value.replace(/[_-]+/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
