// Read-only lookups against the e2e database (driveeasy_e2e), for picking seeded branches/vehicles.
import { query } from "../../helpers/db";
import { loadTestEnv } from "../../helpers/env";

const { e2eUrl } = loadTestEnv();

export const e2eQuery = <T extends object>(sql: string, params: unknown[] = []) => query<T>(e2eUrl, sql, params);

export async function branches() {
  return e2eQuery<{ id: string; code: string; slug: string; name: string }>(
    "select id, code, slug, name from branches where is_active order by code",
  );
}

export async function vehicleAt(branchId: string) {
  const [v] = await e2eQuery<{ id: string; make: string; model: string }>(
    "select id, make, model from vehicles where branch_id = $1 and status <> 'RETIRED' order by plate limit 1",
    [branchId],
  );
  return v;
}

/** "YYYY-MM-DDTHH:mm" N days from today at the given hour, as the search form expects (branch local time). */
export function localDateTime(daysFromNow: number, hour = 10) {
  const d = new Date(Date.now() + daysFromNow * 86400_000);
  const ymd = d.toISOString().slice(0, 10);
  return `${ymd}T${String(hour).padStart(2, "0")}:00`;
}

export function searchUrl(p: { pickupBranch: string; returnBranch?: string; pickupAt: string; returnAt: string }) {
  const qs = new URLSearchParams({
    pickupBranch: p.pickupBranch,
    returnBranch: p.returnBranch ?? p.pickupBranch,
    pickupAt: p.pickupAt,
    returnAt: p.returnAt,
  });
  return `/search?${qs}`;
}

/** Distinct date windows per browser project so parallel projects never fight over the same car. */
export function dayOffset(projectName: string, slot = 0) {
  const base = { setup: 0, chromium: 100, firefox: 300, webkit: 500, mobile: 700 }[projectName] ?? 900;
  return base + slot * 6;
}

export async function reservationByReference(reference: string) {
  const [r] = await e2eQuery<{ id: string; status: string; user_id: string; total_fils: number; deposit_fils: number }>(
    "select id, status, user_id, total_fils, deposit_fils from reservations where reference = $1",
    [reference],
  );
  return r;
}
