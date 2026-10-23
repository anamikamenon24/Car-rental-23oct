import "server-only";
import { and, desc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import { auditLogs, driverProfiles, reservations, users, vehicles } from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { db } from "../db";
import { DomainError, parseInput } from "../errors";
import { toDriverProfileDto, type DriverProfileDto } from "../profile";
import { cancelCore, loadReservationDetail, loadSummaries, type ReservationDetail, type ReservationSummary } from "../reservations";
import { adminCancelSchema, adminReservationFilterSchema, type AdminReservationFilter } from "../validation";

export interface AdminReservationRow extends ReservationSummary {
  customer: { id: string; name: string; email: string };
}

export async function adminListReservations(
  actor: Actor,
  filter: AdminReservationFilter = {},
): Promise<{ items: AdminReservationRow[]; total: number; page: number; pageSize: number }> {
  assertAdmin(actor);
  const f = parseInput(adminReservationFilterSchema, filter);
  const conds: SQL[] = [];
  if (f.status) conds.push(eq(reservations.status, f.status));
  if (f.branchId) conds.push(or(eq(reservations.pickupBranchId, f.branchId), eq(reservations.returnBranchId, f.branchId))!);
  if (f.from) conds.push(gte(reservations.pickupAt, f.from));
  if (f.to) conds.push(lt(reservations.pickupAt, f.to));
  if (f.q) {
    const q = `%${f.q}%`;
    conds.push(
      sql`(${reservations.reference} ilike ${q}
           or exists (select 1 from ${users} u where u.id = ${reservations.userId} and (u.email ilike ${q} or u.name ilike ${q}))
           or exists (select 1 from ${vehicles} v where v.id = ${reservations.vehicleId} and v.plate ilike ${q}))`,
    );
  }
  const where = conds.length ? and(...conds) : undefined;
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(reservations).where(where);
  const items = await loadSummaries(db, where, f.pageSize, (f.page - 1) * f.pageSize);
  const reservationIds = items.map((i) => i.id);
  const customers = reservationIds.length
    ? await db
        .select({ rid: reservations.id, id: users.id, name: users.name, email: users.email })
        .from(reservations)
        .innerJoin(users, eq(users.id, reservations.userId))
        .where(sql`${reservations.id} in ${reservationIds}`)
    : [];
  const byRes = new Map(customers.map((c) => [c.rid, { id: c.id, name: c.name, email: c.email }]));
  return {
    items: items.map((i) => ({ ...i, customer: byRes.get(i.id)! })),
    total: Number(count),
    page: f.page,
    pageSize: f.pageSize,
  };
}

export interface AdminReservationDetail extends ReservationDetail {
  customer: { id: string; name: string; email: string; phone: string | null };
  driver: DriverProfileDto | null;
  auditLog: { id: string; action: string; actorType: string; actorUserId: string | null; before: unknown; after: unknown; metadata: unknown; createdAt: Date }[];
}

export async function adminGetReservation(actor: Actor, id: string): Promise<AdminReservationDetail> {
  assertAdmin(actor);
  const detail = await loadReservationDetail(db, id);
  if (!detail) throw new DomainError("NOT_FOUND", "Reservation not found");
  const [u] = await db.select().from(users).where(eq(users.id, detail.userId));
  const [p] = await db.select().from(driverProfiles).where(eq(driverProfiles.userId, detail.userId));
  const paymentIds = detail.payments.map((x) => x.id).concat(detail.deposits.map((x) => x.id));
  const log = await db
    .select()
    .from(auditLogs)
    .where(
      paymentIds.length
        ? sql`${auditLogs.entityId} = ${id} or ${auditLogs.entityId} in ${paymentIds} or ${auditLogs.metadata}->>'reservationId' = ${id}`
        : sql`${auditLogs.entityId} = ${id} or ${auditLogs.metadata}->>'reservationId' = ${id}`,
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);
  return {
    ...detail,
    customer: { id: u.id, name: u.name, email: u.email, phone: u.phone },
    driver: p ? toDriverProfileDto(p) : null,
    auditLog: log.map((l) => ({
      id: l.id,
      action: l.action,
      actorType: l.actorType,
      actorUserId: l.actorUserId,
      before: l.before,
      after: l.after,
      metadata: l.metadata,
      createdAt: l.createdAt,
    })),
  };
}

/** Admin cancellation. Default refund follows the policy; `refundFils` overrides it (≤ amount paid). */
export async function adminCancelReservation(
  actor: Actor,
  id: string,
  input: { reason: string; refundFils?: number },
  opts: { now?: Date } = {},
) {
  assertAdmin(actor);
  const d = parseInput(adminCancelSchema, input);
  const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
  if (!r) throw new DomainError("NOT_FOUND", "Reservation not found");
  await cancelCore(actor, r, `Admin: ${d.reason}`, d.refundFils, opts.now ?? new Date());
  return adminGetReservation(actor, id);
}
