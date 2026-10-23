import { Badge, type BadgeTone } from "./card";
import { humanize } from "@/lib/ui/format";

const reservationTones: Record<string, BadgeTone> = {
  PENDING: "warning",
  CONFIRMED: "success",
  PICKED_UP: "brand",
  RETURNED: "neutral",
  CANCELLED: "danger",
  EXPIRED: "neutral",
  REFUNDED: "info",
};

const reservationLabels: Record<string, string> = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  PICKED_UP: "On rent",
  RETURNED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Hold expired",
  REFUNDED: "Refunded",
};

export function ReservationStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={reservationTones[status] ?? "neutral"} data-testid="reservation-status" data-status={status}>
      {reservationLabels[status] ?? humanize(status)}
    </Badge>
  );
}

const genericTones: Record<string, BadgeTone> = {
  AVAILABLE: "success",
  RESERVED: "info",
  ON_RENT: "brand",
  MAINTENANCE: "warning",
  RETIRED: "neutral",
  SUCCEEDED: "success",
  HELD: "info",
  RELEASED: "neutral",
  CAPTURED: "warning",
  FAILED: "danger",
  CANCELED: "neutral",
  PARTIALLY_REFUNDED: "info",
  REFUNDED: "info",
  PENDING: "warning",
  OPEN: "warning",
  REPAIRED: "success",
  WAIVED: "neutral",
  MINOR: "info",
  MODERATE: "warning",
  MAJOR: "danger",
};

/** Badge for vehicle / payment / deposit / damage statuses. */
export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  return (
    <Badge tone={genericTones[status] ?? "neutral"} data-testid={testId}>
      {humanize(status)}
    </Badge>
  );
}
