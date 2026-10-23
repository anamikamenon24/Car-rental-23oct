import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  deposits,
  paymentWebhookEvents,
  payments,
  reservations,
  type DepositRow,
  type DepositStatusValue,
  type PaymentRow,
  type PaymentStatusValue,
} from "@/db/schema";
import {
  getPaymentProvider,
  PaymentError,
  type Deposit,
  type Payment,
  type PaymentWebhookEvent,
} from "@/lib/services/payments";
import { db, writeAudit, type DbOrTx, type Tx } from "./db";
import { DomainError, PG, pgConstraint, pgErrorCode } from "./errors";
import { log } from "./log";

// ---------------------------------------------------------------------------------------------
// Status mapping + state machines
// ---------------------------------------------------------------------------------------------

const PAYMENT_STATUS: Record<Payment["status"], PaymentStatusValue> = {
  succeeded: "SUCCEEDED",
  failed: "FAILED",
  canceled: "CANCELED",
  refunded: "REFUNDED",
  partially_refunded: "PARTIALLY_REFUNDED",
};
const DEPOSIT_STATUS: Record<Deposit["status"], DepositStatusValue> = {
  held: "HELD",
  released: "RELEASED",
  captured: "CAPTURED",
  failed: "FAILED",
};

/**
 * Allowed payment transitions. Anything else is ignored, which makes the handlers safe against
 * duplicate and out-of-order events (e.g. a late "succeeded" after "refunded" is dropped).
 */
const PAYMENT_NEXT: Record<PaymentStatusValue, PaymentStatusValue[]> = {
  PENDING: ["SUCCEEDED", "FAILED", "CANCELED", "PARTIALLY_REFUNDED", "REFUNDED"],
  FAILED: ["CANCELED"],
  CANCELED: [],
  SUCCEEDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  REFUNDED: [],
};
const DEPOSIT_NEXT: Record<DepositStatusValue, DepositStatusValue[]> = {
  PENDING: ["HELD", "FAILED", "RELEASED", "CAPTURED", "CANCELED"],
  HELD: ["RELEASED", "CAPTURED"],
  FAILED: ["CANCELED"],
  RELEASED: [],
  CAPTURED: [],
  CANCELED: [],
};

export function canTransitionPayment(from: PaymentStatusValue, to: PaymentStatusValue) {
  return PAYMENT_NEXT[from].includes(to);
}
export function canTransitionDeposit(from: DepositStatusValue, to: DepositStatusValue) {
  return DEPOSIT_NEXT[from].includes(to);
}

export type SnapshotSource = "API" | "WEBHOOK";

export interface ApplyResult {
  applied: boolean;
  outcome: string;
  reservationId: string | null;
  /** Reservations whose money must be settled (refund/release) after the transaction commits. */
  settle: string[];
}

// ---------------------------------------------------------------------------------------------
// Applying provider snapshots (from API responses or verified webhooks)
// ---------------------------------------------------------------------------------------------

async function findPaymentRow(tx: Tx, provider: string, snap: Payment): Promise<PaymentRow | undefined> {
  const byProvider = snap.id
    ? await tx
        .select()
        .from(payments)
        .where(and(eq(payments.provider, provider), eq(payments.providerPaymentId, snap.id)))
        .for("update")
    : [];
  if (byProvider[0]) return byProvider[0];
  if (!isUuid(snap.reference)) return undefined;
  const [row] = await tx.select().from(payments).where(eq(payments.id, snap.reference)).for("update");
  return row;
}

async function findDepositRow(tx: Tx, provider: string, snap: Deposit): Promise<DepositRow | undefined> {
  const byProvider = snap.id
    ? await tx
        .select()
        .from(deposits)
        .where(and(eq(deposits.provider, provider), eq(deposits.providerDepositId, snap.id)))
        .for("update")
    : [];
  if (byProvider[0]) return byProvider[0];
  if (!isUuid(snap.reference)) return undefined;
  const [row] = await tx.select().from(deposits).where(eq(deposits.id, snap.reference)).for("update");
  return row;
}

export async function applyPaymentSnapshot(
  tx: Tx,
  provider: string,
  snap: Payment,
  meta: { source: SnapshotSource; eventAt?: Date; now?: Date },
): Promise<ApplyResult> {
  const row = await findPaymentRow(tx, provider, snap);
  if (!row) return { applied: false, outcome: "unknown_payment", reservationId: null, settle: [] };
  const target = PAYMENT_STATUS[snap.status];
  const refunded = Math.min(row.amountFils, Math.max(row.refundedFils, snap.refundedCents ?? 0));
  const statusChange = target !== row.status && canTransitionPayment(row.status, target);
  const refundChange = refunded > row.refundedFils && (statusChange || row.status === target);
  const idChange = !row.providerPaymentId && !!snap.id;
  if (!statusChange && !refundChange && !idChange) {
    return { applied: false, outcome: `ignored:${row.status}->${target}`, reservationId: row.reservationId, settle: [] };
  }
  const next = {
    status: statusChange ? target : row.status,
    refundedFils: statusChange || refundChange ? refunded : row.refundedFils,
    providerPaymentId: row.providerPaymentId ?? snap.id,
    failureReason: snap.failureReason ?? row.failureReason,
    lastEventAt: maxDate(row.lastEventAt, meta.eventAt),
  };
  await tx.update(payments).set(next).where(eq(payments.id, row.id));
  if (statusChange || refundChange) {
    await writeAudit(tx, {
      actorType: meta.source === "WEBHOOK" ? "WEBHOOK" : "SYSTEM",
      action: "payment.status_changed",
      entityType: "payment",
      entityId: row.id,
      before: { status: row.status, refundedFils: row.refundedFils },
      after: { status: next.status, refundedFils: next.refundedFils },
      metadata: { reservationId: row.reservationId, source: meta.source, providerPaymentId: next.providerPaymentId },
    });
  }
  const settle = row.kind === "RENTAL" ? await reconcileReservation(tx, row.reservationId, meta.now ?? new Date()) : [];
  return { applied: true, outcome: `payment:${row.status}->${next.status}`, reservationId: row.reservationId, settle };
}

export async function applyDepositSnapshot(
  tx: Tx,
  provider: string,
  snap: Deposit,
  meta: { source: SnapshotSource; eventAt?: Date; now?: Date },
): Promise<ApplyResult> {
  const row = await findDepositRow(tx, provider, snap);
  if (!row) return { applied: false, outcome: "unknown_deposit", reservationId: null, settle: [] };
  const target = DEPOSIT_STATUS[snap.status];
  const statusChange = target !== row.status && canTransitionDeposit(row.status, target);
  const idChange = !row.providerDepositId && !!snap.id;
  if (!statusChange && !idChange) {
    return { applied: false, outcome: `ignored:${row.status}->${target}`, reservationId: row.reservationId, settle: [] };
  }
  const next = {
    status: statusChange ? target : row.status,
    capturedFils: statusChange && target === "CAPTURED" ? Math.min(row.amountFils, snap.capturedCents ?? 0) : row.capturedFils,
    providerDepositId: row.providerDepositId ?? snap.id,
    failureReason: snap.failureReason ?? row.failureReason,
    lastEventAt: maxDate(row.lastEventAt, meta.eventAt),
  };
  await tx.update(deposits).set(next).where(eq(deposits.id, row.id));
  if (statusChange) {
    await writeAudit(tx, {
      actorType: meta.source === "WEBHOOK" ? "WEBHOOK" : "SYSTEM",
      action: "deposit.status_changed",
      entityType: "deposit",
      entityId: row.id,
      before: { status: row.status, capturedFils: row.capturedFils },
      after: { status: next.status, capturedFils: next.capturedFils },
      metadata: { reservationId: row.reservationId, source: meta.source, providerDepositId: next.providerDepositId },
    });
  }
  const settle = await reconcileReservation(tx, row.reservationId, meta.now ?? new Date());
  return { applied: true, outcome: `deposit:${row.status}->${next.status}`, reservationId: row.reservationId, settle };
}

/**
 * After any money change: confirm a PENDING reservation once the rental payment has succeeded and
 * the deposit is held (and the hold has not expired). If the hold expired, or the reservation is
 * already EXPIRED/CANCELLED, ask the caller to settle (refund / release) after commit.
 */
export async function reconcileReservation(tx: Tx, reservationId: string, now: Date): Promise<string[]> {
  const [r] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
  if (!r) return [];
  const money = await moneyState(tx, reservationId);
  if (r.status === "PENDING") {
    const paid = money.paidFils >= r.totalFils;
    if (paid && (money.heldDeposit || r.depositFils === 0)) {
      if (r.holdExpiresAt && r.holdExpiresAt > now) {
        await tx
          .update(reservations)
          .set({ status: "CONFIRMED", confirmedAt: now })
          .where(eq(reservations.id, r.id));
        await writeAudit(tx, {
          actorType: "SYSTEM",
          action: "reservation.confirmed",
          entityType: "reservation",
          entityId: r.id,
          before: { status: "PENDING" },
          after: { status: "CONFIRMED" },
          metadata: { reference: r.reference },
        });
        return [];
      }
      await expireReservation(tx, r.id, now, "Hold expired before payment completed");
      return [r.id];
    }
    return [];
  }
  if ((r.status === "EXPIRED" || r.status === "CANCELLED") && (money.paidFils > 0 || money.heldDeposit)) {
    // Late money for a dead booking (e.g. webhook after expiry): give it back.
    return r.status === "EXPIRED" ? [r.id] : [];
  }
  return [];
}

export async function expireReservation(tx: DbOrTx, reservationId: string, now: Date, reason: string) {
  const updated = await tx
    .update(reservations)
    .set({ status: "EXPIRED", expiredAt: now })
    .where(and(eq(reservations.id, reservationId), eq(reservations.status, "PENDING")))
    .returning({ id: reservations.id, reference: reservations.reference });
  if (updated[0]) {
    await writeAudit(tx, {
      actorType: "SYSTEM",
      action: "reservation.expired",
      entityType: "reservation",
      entityId: reservationId,
      before: { status: "PENDING" },
      after: { status: "EXPIRED" },
      metadata: { reason, reference: updated[0].reference },
    });
  }
  return updated.length > 0;
}

/** Net captured rental money and whether a deposit is currently held. */
export async function moneyState(tx: DbOrTx, reservationId: string) {
  const [p] = await tx
    .select({
      paid: sql<number>`coalesce(sum(${payments.amountFils} - ${payments.refundedFils}) filter (where ${payments.status} in ('SUCCEEDED','PARTIALLY_REFUNDED')), 0)::int`,
      refunded: sql<number>`coalesce(sum(${payments.refundedFils}), 0)::int`,
    })
    .from(payments)
    .where(and(eq(payments.reservationId, reservationId), eq(payments.kind, "RENTAL")));
  const held = await tx
    .select({ id: deposits.id })
    .from(deposits)
    .where(and(eq(deposits.reservationId, reservationId), eq(deposits.status, "HELD")))
    .limit(1);
  return { paidFils: Number(p?.paid ?? 0), refundedFils: Number(p?.refunded ?? 0), heldDeposit: held.length > 0 };
}

// ---------------------------------------------------------------------------------------------
// Provider calls (always outside DB transactions), then apply the verified response
// ---------------------------------------------------------------------------------------------

/** Runs post-commit settlement for each reservation id (refund captured rental money, release deposits). */
export async function settleAll(ids: string[], now = new Date()) {
  for (const id of new Set(ids)) {
    try {
      await settleAbandonedReservation(id, now);
    } catch (err) {
      log.error("Failed to settle reservation money", { reservationId: id, err });
    }
  }
}

/**
 * For EXPIRED reservations (or cancelled unpaid ones): refund every captured rental payment in full,
 * release held deposits, and cancel failed provider payments. Idempotent.
 */
export async function settleAbandonedReservation(reservationId: string, now = new Date()) {
  const provider = getPaymentProvider();
  const payRows = await db.select().from(payments).where(eq(payments.reservationId, reservationId));
  for (const p of payRows) {
    if (!p.providerPaymentId) continue;
    if (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") {
      await refundOne(p, undefined, now);
    } else if (p.status === "FAILED" && p.provider === provider.name) {
      const snap = await provider.cancelPayment(p.providerPaymentId).catch(() => null);
      if (snap) await applyInTx((tx) => applyPaymentSnapshot(tx, provider.name, snap, { source: "API", now }), false);
    }
  }
  await releaseHeldDeposits(reservationId, now);
}

/**
 * Rows created by `pnpm db:seed` use this provider name: there is no real charge behind them, so
 * refunds / releases / captures are recorded in our ledger only (through the same state machine).
 */
export const OFFLINE_PROVIDER = "seed";

async function refundOne(p: PaymentRow, amountFils: number | undefined, now: Date): Promise<number> {
  const provider = getPaymentProvider();
  const amount = amountFils ?? p.amountFils - p.refundedFils;
  if (!p.providerPaymentId || amount <= 0) return 0;
  let snap: Payment;
  if (p.provider === provider.name) {
    snap = await provider.refundPayment(p.providerPaymentId, amountFils);
  } else if (p.provider === OFFLINE_PROVIDER) {
    const refunded = p.refundedFils + amount;
    snap = {
      id: p.providerPaymentId,
      reference: p.id,
      amountCents: p.amountFils,
      refundedCents: refunded,
      currency: "aed",
      status: refunded >= p.amountFils ? "refunded" : "partially_refunded",
      createdAt: now.toISOString(),
    };
  } else {
    log.warn("Cannot refund a payment made with another provider", { paymentId: p.id, provider: p.provider });
    return 0;
  }
  await applyInTx((tx) => applyPaymentSnapshot(tx, p.provider, snap, { source: "API", now }), false);
  return amount;
}

/** Releases (captureFils = 0) or captures part of a held deposit. */
async function settleOneDeposit(d: DepositRow, captureFils: number, now: Date) {
  const provider = getPaymentProvider();
  if (!d.providerDepositId) return;
  let snap: Deposit;
  if (d.provider === provider.name) {
    snap =
      captureFils > 0
        ? await provider.captureDeposit(d.providerDepositId, captureFils)
        : await provider.releaseDeposit(d.providerDepositId);
  } else if (d.provider === OFFLINE_PROVIDER) {
    snap = {
      id: d.providerDepositId,
      reference: d.id,
      amountCents: d.amountFils,
      capturedCents: captureFils,
      currency: "aed",
      status: captureFils > 0 ? "captured" : "released",
      createdAt: now.toISOString(),
    };
  } else {
    log.warn("Cannot settle a deposit held with another provider", { depositId: d.id, provider: d.provider });
    return;
  }
  await applyInTx((tx) => applyDepositSnapshot(tx, d.provider, snap, { source: "API", now }), false);
}

export async function releaseHeldDeposits(reservationId: string, now = new Date()) {
  const depRows = await db
    .select()
    .from(deposits)
    .where(and(eq(deposits.reservationId, reservationId), inArray(deposits.status, ["HELD"])));
  for (const d of depRows) await settleOneDeposit(d, 0, now);
}

/** Refunds `amountFils` of captured rental money across payments (newest first). Returns refunded fils. */
export async function refundRental(reservationId: string, amountFils: number, now = new Date()): Promise<number> {
  if (amountFils <= 0) return 0;
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.reservationId, reservationId),
        eq(payments.kind, "RENTAL"),
        inArray(payments.status, ["SUCCEEDED", "PARTIALLY_REFUNDED"]),
      ),
    );
  rows.sort((a, b) => b.attempt - a.attempt);
  let left = amountFils;
  for (const p of rows) {
    if (left <= 0) break;
    const available = p.amountFils - p.refundedFils;
    const amount = Math.min(available, left);
    if (amount <= 0) continue;
    left -= await refundOne(p, amount, now);
  }
  return amountFils - left;
}

/** Applies a snapshot in its own transaction; cascade=false inside settlement to avoid re-entry. */
async function applyInTx(fn: (tx: Tx) => Promise<ApplyResult>, cascade = true) {
  const result = await db.transaction(fn);
  if (cascade && result.settle.length) await settleAll(result.settle);
  return result;
}

/** Creates a payment row, charges the provider and applies the verified response. */
export async function chargeRental(opts: {
  reservationId: string;
  amountFils: number;
  paymentMethod: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<PaymentRow> {
  const provider = getPaymentProvider();
  const key = `${opts.idempotencyKey}:payment`;
  let row: PaymentRow;
  try {
    row = await db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from ${reservations} where id = ${opts.reservationId} for update`);
      const [existing] = await tx.select().from(payments).where(eq(payments.idempotencyKey, key));
      if (existing) {
        if (existing.reservationId !== opts.reservationId) {
          throw new DomainError("IDEMPOTENCY_CONFLICT", "This payment key was already used for another booking");
        }
        return existing;
      }
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${payments.attempt}), 0)::int + 1` })
        .from(payments)
        .where(and(eq(payments.reservationId, opts.reservationId), eq(payments.kind, "RENTAL")));
      const [created] = await tx
        .insert(payments)
        .values({
          reservationId: opts.reservationId,
          kind: "RENTAL",
          attempt: Number(next),
          provider: provider.name,
          idempotencyKey: key,
          amountFils: opts.amountFils,
          currency: "AED",
          status: "PENDING",
        })
        .returning();
      await writeAudit(tx, {
        actorType: "SYSTEM",
        action: "payment.created",
        entityType: "payment",
        entityId: created.id,
        after: { status: "PENDING", amountFils: created.amountFils, attempt: created.attempt },
        metadata: { reservationId: opts.reservationId },
      });
      return created;
    });
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION && pgConstraint(err) === "payments_idempotency_key_key") {
      const [existing] = await db.select().from(payments).where(eq(payments.idempotencyKey, key));
      if (existing) {
        if (existing.reservationId !== opts.reservationId) {
          throw new DomainError("IDEMPOTENCY_CONFLICT", "This payment key was already used for another booking");
        }
        row = existing;
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  if (row.status !== "PENDING") return row;

  let snap: Payment;
  try {
    snap = await provider.createPayment({
      amountCents: row.amountFils,
      currency: "AED",
      reference: row.id,
      idempotencyKey: row.idempotencyKey,
      paymentMethod: opts.paymentMethod,
    });
  } catch (err) {
    log.warn("Payment provider error", { paymentId: row.id, err });
    snap = {
      id: "",
      reference: row.id,
      amountCents: row.amountFils,
      refundedCents: 0,
      currency: "aed",
      status: "failed",
      failureReason: err instanceof PaymentError ? err.code : "provider_error",
      createdAt: new Date().toISOString(),
    };
  }
  await applyInTx((tx) => applyPaymentSnapshot(tx, provider.name, snap, { source: "API", now: opts.now }));
  const [fresh] = await db.select().from(payments).where(eq(payments.id, row.id));
  return fresh;
}

/** Creates a deposit row, asks the provider for an authorisation hold and applies the response. */
export async function holdDeposit(opts: {
  reservationId: string;
  amountFils: number;
  paymentMethod: string;
  idempotencyKey: string;
  now?: Date;
}): Promise<DepositRow> {
  const provider = getPaymentProvider();
  const key = `${opts.idempotencyKey}:deposit`;
  let row: DepositRow;
  try {
    row = await db.transaction(async (tx) => {
      await tx.execute(sql`select 1 from ${reservations} where id = ${opts.reservationId} for update`);
      const [existing] = await tx.select().from(deposits).where(eq(deposits.idempotencyKey, key));
      if (existing) return existing;
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${deposits.attempt}), 0)::int + 1` })
        .from(deposits)
        .where(eq(deposits.reservationId, opts.reservationId));
      const [created] = await tx
        .insert(deposits)
        .values({
          reservationId: opts.reservationId,
          attempt: Number(next),
          provider: provider.name,
          idempotencyKey: key,
          amountFils: opts.amountFils,
          currency: "AED",
          status: "PENDING",
        })
        .returning();
      await writeAudit(tx, {
        actorType: "SYSTEM",
        action: "deposit.created",
        entityType: "deposit",
        entityId: created.id,
        after: { status: "PENDING", amountFils: created.amountFils, attempt: created.attempt },
        metadata: { reservationId: opts.reservationId },
      });
      return created;
    });
  } catch (err) {
    if (pgErrorCode(err) === PG.UNIQUE_VIOLATION && pgConstraint(err) === "deposits_idempotency_key_key") {
      const [existing] = await db.select().from(deposits).where(eq(deposits.idempotencyKey, key));
      if (existing) {
        row = existing;
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }
  if (row.status !== "PENDING") return row;

  let snap: Deposit;
  try {
    snap = await provider.holdDeposit({
      amountCents: row.amountFils,
      currency: "AED",
      reference: row.id,
      idempotencyKey: row.idempotencyKey,
      paymentMethod: opts.paymentMethod,
    });
  } catch (err) {
    log.warn("Deposit provider error", { depositId: row.id, err });
    snap = {
      id: "",
      reference: row.id,
      amountCents: row.amountFils,
      capturedCents: 0,
      currency: "aed",
      status: "failed",
      failureReason: err instanceof PaymentError ? err.code : "provider_error",
      createdAt: new Date().toISOString(),
    };
  }
  await applyInTx((tx) => applyDepositSnapshot(tx, provider.name, snap, { source: "API", now: opts.now }));
  const [fresh] = await db.select().from(deposits).where(eq(deposits.id, row.id));
  return fresh;
}

/** Captures part or all of the held deposit (the rest is released by the provider). 0 = release. */
export async function settleDeposit(reservationId: string, captureFils: number, now = new Date()) {
  const [d] = await db
    .select()
    .from(deposits)
    .where(and(eq(deposits.reservationId, reservationId), eq(deposits.status, "HELD")))
    .limit(1);
  if (!d || !d.providerDepositId) return { capturedFils: 0, released: false, depositId: null };
  const amount = Math.max(0, Math.min(captureFils, d.amountFils));
  await settleOneDeposit(d, amount, now);
  const [after] = await db.select().from(deposits).where(eq(deposits.id, d.id));
  return {
    capturedFils: after.status === "CAPTURED" ? after.capturedFils : 0,
    released: after.status === "RELEASED",
    depositId: d.id,
  };
}

// ---------------------------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------------------------

/**
 * Verifies, dedupes (unique provider+event id) and applies a provider webhook. The event row is
 * inserted in the same transaction as the state change, so an event is recorded iff it was
 * processed; a concurrent duplicate waits on the unique index and then reports duplicate.
 */
export async function handlePaymentWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<{ duplicate: boolean; outcome: string }> {
  const provider = getPaymentProvider();
  let event: PaymentWebhookEvent;
  try {
    event = provider.verifyWebhook(rawBody, signatureHeader);
  } catch (err) {
    if (err instanceof PaymentError && err.code === "invalid_signature") {
      throw new DomainError("UNAUTHENTICATED", "Invalid webhook signature");
    }
    throw new DomainError("VALIDATION", "Malformed webhook");
  }
  const eventAt = event.createdAt ? new Date(event.createdAt) : undefined;

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentWebhookEvents)
      .values({
        provider: provider.name,
        eventId: event.id,
        type: event.type,
        payload: JSON.parse(rawBody),
        eventCreatedAt: eventAt,
      })
      .onConflictDoNothing({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.eventId] })
      .returning({ id: paymentWebhookEvents.id });
    if (!inserted[0]) return { duplicate: true, outcome: "duplicate", settle: [] as string[] };

    let applied: ApplyResult;
    if (event.type === "ignored") {
      applied = { applied: false, outcome: "ignored_event_type", reservationId: null, settle: [] };
    } else if (event.type.startsWith("payment.")) {
      applied = await applyPaymentSnapshot(tx, provider.name, event.data as Payment, { source: "WEBHOOK", eventAt });
    } else {
      applied = await applyDepositSnapshot(tx, provider.name, event.data as Deposit, { source: "WEBHOOK", eventAt });
    }
    await tx
      .update(paymentWebhookEvents)
      .set({ processedAt: new Date(), outcome: applied.outcome })
      .where(eq(paymentWebhookEvents.id, inserted[0].id));
    return { duplicate: false, outcome: applied.outcome, settle: applied.settle };
  });
  if (result.settle.length) await settleAll(result.settle);
  log.info("Payment webhook processed", { eventId: event.id, type: event.type, duplicate: result.duplicate, outcome: result.outcome });
  return { duplicate: result.duplicate, outcome: result.outcome };
}

function maxDate(a: Date | null, b: Date | undefined): Date | null {
  if (!b || Number.isNaN(b.getTime())) return a;
  if (!a) return b;
  return a > b ? a : b;
}

function isUuid(v: string | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
