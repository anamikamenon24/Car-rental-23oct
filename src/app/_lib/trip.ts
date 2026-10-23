import "server-only";
import type { BranchDto } from "@/server/catalog";
import { addDaysToDateString, utcToZonedDate, zonedLocalToUtc } from "@/lib/ui/datetime";
import type { TripParams } from "@/lib/ui/search-params";

export type ResolvedTrip = {
  params: TripParams;
  pickupBranch: BranchDto;
  returnBranch: BranchDto;
  pickupAt: Date;
  returnAt: Date;
};

export type TripProblem = { field: keyof TripParams | "_form"; message: string };

/**
 * Turns URL trip params into branch objects + UTC instants. Pick-up time is read in the pick-up
 * branch's zone and return time in the return branch's zone. Business rules (minimum lead time,
 * opening hours, max length) are enforced by the server services; this only checks shape.
 */
export function resolveTrip(
  params: TripParams,
  branches: BranchDto[],
): { ok: true; trip: ResolvedTrip } | { ok: false; problem: TripProblem } {
  const pickupBranch = branches.find((b) => b.id === params.pickupBranch);
  if (!pickupBranch) return { ok: false, problem: { field: "pickupBranch", message: "Choose a valid pick-up branch." } };
  const returnBranch = branches.find((b) => b.id === params.returnBranch);
  if (!returnBranch) return { ok: false, problem: { field: "returnBranch", message: "Choose a valid return branch." } };
  const pickupAt = zonedLocalToUtc(params.pickupAt, pickupBranch.timeZone);
  const returnAt = zonedLocalToUtc(params.returnAt, returnBranch.timeZone);
  if (!pickupAt) return { ok: false, problem: { field: "pickupAt", message: "Enter a valid pick-up time." } };
  if (!returnAt) return { ok: false, problem: { field: "returnAt", message: "Enter a valid return time." } };
  if (returnAt <= pickupAt) return { ok: false, problem: { field: "returnAt", message: "Return must be after pick-up." } };
  return { ok: true, trip: { params, pickupBranch, returnBranch, pickupAt, returnAt } };
}

/** Default trip: tomorrow 10:00 → three days later 10:00, branch local time. Call after connection(). */
export function defaultTrip(branch: Pick<BranchDto, "id" | "timeZone"> | undefined, now: Date): TripParams {
  const tz = branch?.timeZone ?? "Asia/Dubai";
  const today = utcToZonedDate(now, tz);
  const start = addDaysToDateString(today, 1);
  const end = addDaysToDateString(today, 4);
  return {
    pickupBranch: branch?.id ?? "",
    returnBranch: branch?.id ?? "",
    pickupAt: `${start}T10:00`,
    returnAt: `${end}T10:00`,
  };
}
