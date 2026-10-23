import "server-only";
import { sql } from "drizzle-orm";
import { damageReports, reservations, vehicles } from "@/db/schema";
import { addDaysToDate, localDate, zonedTimeToUtc } from "@/lib/time";
import { assertAdmin, type Actor } from "../auth";
import { db } from "../db";

/** Operational counts for "today" in the UAE (Asia/Dubai). */
export async function adminDashboard(actor: Actor, opts: { now?: Date; timeZone?: string } = {}) {
  assertAdmin(actor);
  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? "Asia/Dubai";
  const today = localDate(now, tz);
  const start = zonedTimeToUtc(today, tz);
  const end = zonedTimeToUtc(addDaysToDate(today, 1), tz);

  const [counts] = await db
    .select({
      pickupsToday: sql<number>`count(*) filter (where ${reservations.status} = 'CONFIRMED' and ${reservations.pickupAt} >= ${start} and ${reservations.pickupAt} < ${end})::int`,
      returnsToday: sql<number>`count(*) filter (where ${reservations.status} = 'PICKED_UP' and ${reservations.returnAt} >= ${start} and ${reservations.returnAt} < ${end})::int`,
      overdue: sql<number>`count(*) filter (where ${reservations.status} = 'PICKED_UP' and ${reservations.returnAt} < ${now})::int`,
      activeRentals: sql<number>`count(*) filter (where ${reservations.status} = 'PICKED_UP')::int`,
      pendingHolds: sql<number>`count(*) filter (where ${reservations.status} = 'PENDING')::int`,
      upcoming: sql<number>`count(*) filter (where ${reservations.status} = 'CONFIRMED' and ${reservations.pickupAt} >= ${now})::int`,
    })
    .from(reservations);
  const fleet = await db
    .select({ status: vehicles.status, count: sql<number>`count(*)::int` })
    .from(vehicles)
    .groupBy(vehicles.status);
  const [damage] = await db
    .select({ open: sql<number>`count(*) filter (where ${damageReports.status} = 'OPEN')::int` })
    .from(damageReports);
  return {
    date: today,
    timeZone: tz,
    ...Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])),
    fleetByStatus: Object.fromEntries(fleet.map((f) => [f.status, Number(f.count)])) as Record<string, number>,
    openDamageReports: Number(damage?.open ?? 0),
  } as {
    date: string;
    timeZone: string;
    pickupsToday: number;
    returnsToday: number;
    overdue: number;
    activeRentals: number;
    pendingHolds: number;
    upcoming: number;
    fleetByStatus: Record<string, number>;
    openDamageReports: number;
  };
}
