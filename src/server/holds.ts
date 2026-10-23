import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { deposits, payments, reservations } from "@/db/schema";
import { db, writeAudit } from "./db";
import { log } from "./log";
import { releaseHeldDeposits, settleAll } from "./payments";

/**
 * Releases expired booking holds. Idempotent: PENDING reservations whose hold_expires_at <= now
 * become EXPIRED (which also stops them blocking the vehicle in the EXCLUDE constraint), then any
 * money attached to them is returned (captured payments refunded, deposit holds released, failed
 * provider payments cancelled). It also self-heals: EXPIRED/CANCELLED bookings that still have a
 * held deposit (or, for EXPIRED, captured money) from an earlier crash or a late webhook are settled.
 */
export async function releaseExpiredHolds({ now = new Date() }: { now?: Date } = {}) {
  const expired = await db.transaction(async (tx) => {
    const rows = await tx
      .update(reservations)
      .set({ status: "EXPIRED", expiredAt: now })
      .where(and(eq(reservations.status, "PENDING"), lte(reservations.holdExpiresAt, now)))
      .returning({ id: reservations.id, reference: reservations.reference });
    for (const r of rows) {
      await writeAudit(tx, {
        actorType: "SYSTEM",
        action: "reservation.expired",
        entityType: "reservation",
        entityId: r.id,
        before: { status: "PENDING" },
        after: { status: "EXPIRED" },
        metadata: { reason: "Hold expired (release job)", reference: r.reference },
      });
    }
    return rows.map((r) => r.id);
  });

  // EXPIRED bookings with captured money or a held deposit: return everything.
  const expiredWithMoney = await db
    .selectDistinct({ id: reservations.id })
    .from(reservations)
    .where(
      sql`${reservations.status} = 'EXPIRED' and (
             exists (select 1 from ${deposits} d where d.reservation_id = ${reservations.id} and d.status = 'HELD')
          or exists (select 1 from ${payments} p where p.reservation_id = ${reservations.id} and p.kind = 'RENTAL'
                       and p.status in ('SUCCEEDED','PARTIALLY_REFUNDED')))`,
    );
  const toSettle = [...new Set([...expired, ...expiredWithMoney.map((r) => r.id)])];
  if (toSettle.length) await settleAll(toSettle, now);

  // Cancelled bookings keep the policy refund, but their deposit hold must always be released.
  const cancelledWithDeposit = await db
    .selectDistinct({ id: reservations.id })
    .from(reservations)
    .where(
      sql`${reservations.status} in ('CANCELLED','REFUNDED') and exists (
             select 1 from ${deposits} d where d.reservation_id = ${reservations.id} and d.status = 'HELD')`,
    );
  for (const r of cancelledWithDeposit) {
    await releaseHeldDeposits(r.id, now).catch((err) => log.error("Deposit release failed", { reservationId: r.id, err }));
  }

  if (expired.length) log.info("Released expired holds", { count: expired.length });
  return { count: expired.length, reservationIds: expired, settled: toSettle.length + cancelledWithDeposit.length };
}

/** Admin/QA helper: which PENDING holds are past their expiry right now. */
export async function listExpiredHoldIds(now = new Date()) {
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(and(eq(reservations.status, "PENDING"), lte(reservations.holdExpiresAt, now)));
  return rows.map((r) => r.id);
}

