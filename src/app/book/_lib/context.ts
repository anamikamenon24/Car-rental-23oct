import "server-only";
import { notFound } from "next/navigation";
import { getVehicle, listBranches, searchVehicles } from "@/server/catalog";
import { parseExtras, parseTrip, type RawSearchParams, type TripParams } from "@/lib/ui/search-params";
import { resolveTrip, type ResolvedTrip } from "../../_lib/trip";
import { attempt } from "../../_lib/errors";

/** Loads the vehicle + trip for a booking step. Cars are always collected at their home branch. */
export async function loadBookingContext(vehicleId: string, sp: RawSearchParams) {
  const found = await attempt(() => getVehicle(vehicleId));
  if (!found.ok || !found.data) notFound();
  const vehicle = found.data;
  const branches = await listBranches();

  const raw = parseTrip(sp);
  const tripParams: TripParams | null = raw ? { ...raw, pickupBranch: vehicle.branch.id } : null;
  const resolved = tripParams ? resolveTrip(tripParams, branches) : null;
  const trip: ResolvedTrip | null = resolved?.ok ? resolved.trip : null;
  const tripProblem = resolved && !resolved.ok ? resolved.problem.message : null;
  const extras = parseExtras(sp);

  return { vehicle, branches, tripParams, trip, tripProblem, extras };
}

/**
 * True when the vehicle is free for the whole trip (same query the search page uses), or an
 * error message from the availability service (e.g. pick-up time in the past).
 */
export async function checkAvailability(vehicleId: string, trip: ResolvedTrip) {
  const res = await attempt(() =>
    searchVehicles({
      pickupBranchId: trip.pickupBranch.id,
      returnBranchId: trip.returnBranch.id,
      pickupAt: trip.pickupAt,
      returnAt: trip.returnAt,
    }),
  );
  if (!res.ok) return { available: false as const, message: res.error.message };
  const available = res.data.some((r) => r.vehicle.id === vehicleId);
  return available
    ? { available: true as const, message: null }
    : { available: false as const, message: "This car is already booked for part of these dates." };
}
