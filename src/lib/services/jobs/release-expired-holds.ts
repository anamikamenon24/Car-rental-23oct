import { sql } from "drizzle-orm";
import type { JobContext, JobResult } from ".";

/**
 * Expected shape once the bookings schema exists:
 *   booking_holds(status text, expires_at timestamptz, released_at timestamptz)
 * Adjust this query when that table is defined in src/db/schema.ts.
 */
const HOLDS_TABLE = "booking_holds";

export async function releaseExpiredHolds({ db, now }: JobContext): Promise<JobResult> {
  const exists = await db.execute<{ t: string | null }>(sql`select to_regclass(${`public.${HOLDS_TABLE}`}) as t`);
  if (!exists.rows[0]?.t) {
    return { count: 0, summary: `No ${HOLDS_TABLE} table yet; nothing to release` };
  }

  const released = await db.execute(sql`
    update ${sql.identifier(HOLDS_TABLE)}
    set status = 'released', released_at = ${now}
    where status = 'active' and expires_at <= ${now}
  `);
  const count = released.rowCount ?? 0;
  return { count, summary: `Released ${count} expired hold(s)` };
}
