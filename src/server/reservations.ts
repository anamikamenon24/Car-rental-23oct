import "server-only";
import { randomInt } from "node:crypto";
import { and, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import QRCode from "qrcode";
import {
  branches,
  deposits,
  driverProfiles,
  extras as extrasTable,
  payments,
  rentalAgreements,
  reservationExtras,
  reservations,
  vehicleCategories,
  vehicles,
  type Reservation,
} from "@/db/schema";
import { CANCELLATION_POLICY, HOLD_MINUTES_DEFAULT } from "@/lib/constants";
import { assertActor, type Actor } from "./auth";
import { db, writeAudit, type DbOrTx, type Tx } from "./db";
import { DomainError, invalidState, isDomainError, parseInput, pgConstraint, pgErrorCode, PG, toDomainError, vehicleUnavailable } from "./errors";
import { log } from "./log";
import {
  chargeRental,
  expireReservation,
  holdDeposit,
  moneyState,
  refundRental,
  releaseHeldDeposits,
  settleAbandonedReservation,
  settleAll,
} from "./payments";
import { cancellationRefund, type Quote } from "./pricing";
import { upsertDriverProfile } from "./profile";
import { buildQuote } from "./quotes";
import {
  cancelSchema,
  createReservationSchema,
  dateChangeSchema,
  driverProfileSchema,
  modifyDatesSchema,
  payReservationSchema,
  type CreateReservationInput,
  type DateChangeInput,
  type ModifyDatesInput,
  type PayReservationInput,
} from "./validation";

export const MAX_RENTAL_DAYS = 90;

/** Hold length in minutes (env RESERVATION_HOLD_MINUTES, read at call time; default 15). */
export function holdMinutes(): number {
  const n = Number(process.env.RESERVATION_HOLD_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : HOLD_MINUTES_DEFAULT;
}

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export type ReservationStatus = Reservation["status"];

export interface BranchRef {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  timeZone: string;
}

export interface ReservationSummary {
  id: string;
  reference: string;
  status: ReservationStatus;
  pickupAt: Date;
  returnAt: Date;
  holdExpiresAt: Date | null;
  pickupBranch: BranchRef;
  returnBranch: BranchRef;
  vehicle: { id: string; make: string; model: string; year: number; imageUrl: string | null; categoryName: string; plate: string };
  totalFils: number;
  depositFils: number;
  createdAt: Date;
}

export interface PaymentDto {
  id: string;
  kind: "RENTAL" | "ADDITIONAL_CHARGES";
  attempt: number;
  provider: string;
  amountFils: number;
  refundedFils: number;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "PARTIALLY_REFUNDED" | "REFUNDED";
  failureReason: string | null;
  createdAt: Date;
}

export interface DepositDto {
  id: string;
  attempt: number;
  amountFils: number;
  capturedFils: number;
  status: "PENDING" | "HELD" | "RELEASED" | "CAPTURED" | "FAILED" | "CANCELED";
  failureReason: string | null;
  createdAt: Date;
}

export interface AgreementDto {
  id: string;
  agreementNumber: string;
  checkedOutAt: Date;
  pickupMileageKm: number;
  pickupFuelEighths: number;
  pickupNotes: string | null;
  checkedInAt: Date | null;
  returnMileageKm: number | null;
  returnFuelEighths: number | null;
  returnNotes: string | null;
  lateMinutes: number;
  lateFeeFils: number;
  fuelChargeFils: number;
  damageChargeFils: number;
  additionalVatFils: number;
  additionalTotalFils: number;
  depositCapturedFils: number;
  balanceDueFils: number;
}

export interface ReservationDetail extends ReservationSummary {
  userId: string;
  quote: Quote;
  extras: { extraId: string; name: string; chargeType: "PER_DAY" | "PER_RENTAL"; quantity: number; unitPriceFils: number; totalFils: number }[];
  payments: PaymentDto[];
  deposits: DepositDto[];
  paidFils: number;
  refundFils: number;
  cancellationReason: string | null;
  notes: string | null;
  confirmedAt: Date | null;
  pickedUpAt: Date | null;
  returnedAt: Date | null;
  cancelledAt: Date | null;
  agreement: AgreementDto | null;
  canCancel: boolean;
  canModify: boolean;
  canPay: boolean;
  voucherAvailable: boolean;
}

export interface PaymentOutcome {
  reservationStatus: ReservationStatus;
  paymentStatus: PaymentDto["status"] | null;
  depositStatus: DepositDto["status"] | null;
  failureReason?: string;
  canRetry: boolean;
}

// ---------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateReference(): string {
  let s = "DE-";
  for (let i = 0; i < 8; i++) s += REF_ALPHABET[randomInt(REF_ALPHABET.length)];
  return s;
}

function branchRef(b: typeof branches.$inferSelect): BranchRef {
  return { id: b.id, code: b.code, name: b.name, city: b.city, address: b.address, phone: b.phone, timeZone: b.timeZone };
}

/** Summaries for a set of reservation conditions (newest pick-up first). */
export async function loadSummaries(tx: DbOrTx, where: SQL | undefined, limit = 200, offset = 0) {
  const rows = await tx
    .select({ r: reservations, v: vehicles, c: vehicleCategories })
    .from(reservations)
    .innerJoin(vehicles, eq(vehicles.id, reservations.vehicleId))
    .innerJoin(vehicleCategories, eq(vehicleCategories.id, vehicles.categoryId))
    .where(where)
    .orderBy(desc(reservations.pickupAt), desc(reservations.createdAt))
    .limit(limit)
    .offset(offset);
  const branchIds = [...new Set(rows.flatMap((x) => [x.r.pickupBranchId, x.r.returnBranchId]))];
  const branchRows = branchIds.length ? await tx.select().from(branches).where(inArray(branches.id, branchIds)) : [];
  const byId = new Map(branchRows.map((b) => [b.id, branchRef(b)]));
  return rows.map(({ r, v, c }): ReservationSummary => ({
    id: r.id,
    reference: r.reference,
    status: r.status,
    pickupAt: r.pickupAt,
    returnAt: r.returnAt,
    holdExpiresAt: r.holdExpiresAt,
    pickupBranch: byId.get(r.pickupBranchId)!,
    returnBranch: byId.get(r.returnBranchId)!,
    vehicle: { id: v.id, make: v.make, model: v.model, year: v.year, imageUrl: v.imageUrl, categoryName: c.name, plate: v.plate },
    totalFils: r.totalFils,
    depositFils: r.depositFils,
    createdAt: r.createdAt,
  }));
}

export async function loadReservationDetail(tx: DbOrTx, id: string, now = new Date()): Promise<ReservationDetail | null> {
  if (!isUuid(id)) return null;
  const [summary] = await loadSummaries(tx, eq(reservations.id, id), 1);
  if (!summary) return null;
  const [r] = await tx.select().from(reservations).where(eq(reservations.id, id));
  const [ex, pays, deps, agreements, money] = await Promise.all([
    tx.select().from(reservationExtras).where(eq(reservationExtras.reservationId, id)),
    tx.select().from(payments).where(eq(payments.reservationId, id)).orderBy(payments.createdAt),
    tx.select().from(deposits).where(eq(deposits.reservationId, id)).orderBy(deposits.createdAt),
    tx.select().from(rentalAgreements).where(eq(rentalAgreements.reservationId, id)),
    moneyState(tx, id),
  ]);
  const a = agreements[0];
  const beforePickup = now < r.pickupAt;
  const holdValid = r.status === "PENDING" && !!r.holdExpiresAt && r.holdExpiresAt > now;
  return {
    ...summary,
    userId: r.userId,
    quote: r.priceBreakdown as Quote,
    extras: ex.map((e) => ({
      extraId: e.extraId,
      name: e.name,
      chargeType: e.chargeType,
      quantity: e.quantity,
      unitPriceFils: e.unitPriceFils,
      totalFils: e.totalFils,
    })),
    payments: pays.map((p) => ({
      id: p.id,
      kind: p.kind,
      attempt: p.attempt,
      provider: p.provider,
      amountFils: p.amountFils,
      refundedFils: p.refundedFils,
      status: p.status,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
    })),
    deposits: deps.map((d) => ({
      id: d.id,
      attempt: d.attempt,
      amountFils: d.amountFils,
      capturedFils: d.capturedFils,
      status: d.status,
      failureReason: d.failureReason,
      createdAt: d.createdAt,
    })),
    paidFils: money.paidFils,
    refundFils: r.refundFils,
    cancellationReason: r.cancellationReason,
    notes: r.notes,
    confirmedAt: r.confirmedAt,
    pickedUpAt: r.pickedUpAt,
    returnedAt: r.returnedAt,
    cancelledAt: r.cancelledAt,
    agreement: a
      ? {
          id: a.id,
          agreementNumber: a.agreementNumber,
          checkedOutAt: a.checkedOutAt,
          pickupMileageKm: a.pickupMileageKm,
          pickupFuelEighths: a.pickupFuelEighths,
          pickupNotes: a.pickupNotes,
          checkedInAt: a.checkedInAt,
          returnMileageKm: a.returnMileageKm,
          returnFuelEighths: a.returnFuelEighths,
          returnNotes: a.returnNotes,
          lateMinutes: a.lateMinutes,
          lateFeeFils: a.lateFeeFils,
          fuelChargeFils: a.fuelChargeFils,
          damageChargeFils: a.damageChargeFils,
          additionalVatFils: a.additionalVatFils,
          additionalTotalFils: a.additionalTotalFils,
          depositCapturedFils: a.depositCapturedFils,
          balanceDueFils: a.balanceDueFils,
        }
      : null,
    canCancel: (r.status === "PENDING" || r.status === "CONFIRMED") && beforePickup,
    canModify: r.status === "CONFIRMED" && beforePickup,
    canPay: holdValid,
    voucherAvailable: r.status === "CONFIRMED" || r.status === "PICKED_UP",
  };
}

async function loadOwned(actor: Actor, id: string): Promise<Reservation> {
  assertActor(actor);
  if (!isUuid(id)) throw new DomainError("NOT_FOUND", "Reservation not found");
  const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
  // Someone else's booking looks exactly like a missing one.
  if (!r || (r.userId !== actor.id && actor.role !== "ADMIN")) throw new DomainError("NOT_FOUND", "Reservation not found");
  return r;
}

// ---------------------------------------------------------------------------------------------
// Overlap helpers (used inside the vehicle-locked transaction)
// ---------------------------------------------------------------------------------------------

/** Flips PENDING holds that have expired for this vehicle to EXPIRED. Returns their ids. */
export async function expireStaleHoldsForVehicle(tx: Tx, vehicleId: string, now: Date): Promise<string[]> {
  const stale = await tx
    .update(reservations)
    .set({ status: "EXPIRED", expiredAt: now })
    .where(and(eq(reservations.vehicleId, vehicleId), eq(reservations.status, "PENDING"), lte(reservations.holdExpiresAt, now)))
    .returning({ id: reservations.id, reference: reservations.reference });
  for (const s of stale) {
    await writeAudit(tx, {
      actorType: "SYSTEM",
      action: "reservation.expired",
      entityType: "reservation",
      entityId: s.id,
      before: { status: "PENDING" },
      after: { status: "EXPIRED" },
      metadata: { reason: "Hold expired (released while booking the same vehicle)", reference: s.reference },
    });
  }
  return stale.map((s) => s.id);
}

/** True if the vehicle has an active reservation (other than `excludeId`) or maintenance block overlapping [from, to). */
export async function hasConflict(tx: DbOrTx, vehicleId: string, from: Date, to: Date, excludeId?: string): Promise<boolean> {
  const range = sql`tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)')`;
  const res = await tx.execute(sql`
    select 1 from ${reservations}
     where vehicle_id = ${vehicleId}
       and status in ('PENDING','CONFIRMED','PICKED_UP')
       and period && ${range}
       ${excludeId ? sql`and id <> ${excludeId}` : sql``}
    union all
    select 1 from maintenance_blocks where vehicle_id = ${vehicleId} and period && ${range}
    limit 1`);
  return (res.rowCount ?? res.rows.length) > 0;
}

async function lockVehicle(tx: Tx, vehicleId: string) {
  const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for("update");
  if (!v || v.status === "RETIRED") throw new DomainError("NOT_FOUND", "Vehicle not found");
  return v;
}

// ---------------------------------------------------------------------------------------------
// Create hold
// ---------------------------------------------------------------------------------------------

export interface HoldResult {
  reservationId: string;
  reference: string;
  holdExpiresAt: Date;
  quote: Quote;
}

/**
 * The reservation transaction:
 *   BEGIN; lock the vehicle row (FOR UPDATE); expire stale holds for that vehicle; check for
 *   overlapping reservations / maintenance; price on the server; insert a PENDING reservation with
 *   hold_expires_at = now + RESERVATION_HOLD_MINUTES; COMMIT.
 * The EXCLUDE constraint and the maintenance trigger are the final guard (23P01 → VEHICLE_UNAVAILABLE).
 * The idempotency key is unique, so a retried request returns the same reservation.
 */
export async function createReservationHold(
  actor: Actor,
  input: CreateReservationInput,
  opts: { now?: Date } = {},
): Promise<HoldResult> {
  assertActor(actor);
  const data = parseInput(createReservationSchema, input);
  const now = opts.now ?? new Date();

  const existing = await findByKey(data.idempotencyKey);
  if (existing) return sameKeyResult(actor, existing, data);

  if (data.pickupAt.getTime() < now.getTime() - 5 * 60_000) {
    throw new DomainError("VALIDATION", "Pick-up time is in the past", { fieldErrors: { pickupAt: ["Choose a future time"] } });
  }
  if (data.returnAt.getTime() - data.pickupAt.getTime() > MAX_RENTAL_DAYS * 86_400_000) {
    throw new DomainError("VALIDATION", `Rentals are limited to ${MAX_RENTAL_DAYS} days`, { fieldErrors: { returnAt: ["Too long"] } });
  }

  let stale: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      if (data.driver) {
        await upsertDriverProfile(tx, actor, parseInput(driverProfileSchema, data.driver));
      } else {
        const [p] = await tx.select({ id: driverProfiles.id }).from(driverProfiles).where(eq(driverProfiles.userId, actor.id));
        if (!p) throw new DomainError("DRIVER_PROFILE_REQUIRED", "Please add the driver's details and licence first");
      }

      const vehicle = await lockVehicle(tx, data.vehicleId);
      const [existingInTx] = await tx.select().from(reservations).where(eq(reservations.idempotencyKey, data.idempotencyKey));
      if (existingInTx) return sameKeyResult(actor, existingInTx, data);

      if (vehicle.status === "MAINTENANCE") throw vehicleUnavailable();
      stale = await expireStaleHoldsForVehicle(tx, vehicle.id, now);
      if (await hasConflict(tx, vehicle.id, data.pickupAt, data.returnAt)) throw vehicleUnavailable();

      const { quote } = await buildQuote(tx, data);
      const holdExpiresAt = new Date(now.getTime() + holdMinutes() * 60_000);
      const [r] = await tx
        .insert(reservations)
        .values({
          reference: generateReference(),
          userId: actor.id,
          vehicleId: vehicle.id,
          pickupBranchId: data.pickupBranchId,
          returnBranchId: data.returnBranchId,
          pickupAt: data.pickupAt,
          returnAt: data.returnAt,
          status: "PENDING",
          holdExpiresAt,
          idempotencyKey: data.idempotencyKey,
          currency: "AED",
          rentalDays: quote.days,
          dailyRateFils: quote.dailyRateFils,
          baseFils: quote.rentalFils,
          extrasFils: quote.extrasFils,
          oneWayFeeFils: quote.oneWayFeeFils,
          subtotalFils: quote.subtotalFils,
          vatFils: quote.vatFils,
          totalFils: quote.totalFils,
          depositFils: quote.depositFils,
          pricingRuleId: quote.pricingRuleId,
          priceBreakdown: quote,
          notes: data.notes ?? null,
        })
        .returning();
      if (quote.extras.length) {
        await tx.insert(reservationExtras).values(
          quote.extras.map((e) => ({
            reservationId: r.id,
            extraId: e.extraId,
            name: e.name,
            chargeType: e.chargeType,
            quantity: e.quantity,
            unitPriceFils: e.unitFils,
            totalFils: e.totalFils,
          })),
        );
      }
      await writeAudit(tx, {
        actor,
        action: "reservation.created",
        entityType: "reservation",
        entityId: r.id,
        after: { status: "PENDING", holdExpiresAt, totalFils: r.totalFils, vehicleId: r.vehicleId, pickupAt: r.pickupAt, returnAt: r.returnAt },
        metadata: { reference: r.reference },
      });
      return { reservationId: r.id, reference: r.reference, holdExpiresAt, quote };
    });
    if (stale.length) await settleAll(stale, now);
    log.info("Reservation hold created", { reservationId: result.reservationId, reference: result.reference });
    return result;
  } catch (err) {
    if (
      (pgErrorCode(err) === PG.UNIQUE_VIOLATION && pgConstraint(err) === "reservations_idempotency_key_key") ||
      isDomainError(err, "VEHICLE_UNAVAILABLE")
    ) {
      const again = await findByKey(data.idempotencyKey);
      if (again) return sameKeyResult(actor, again, data);
    }
    throw toDomainError(err);
  }
}

async function findByKey(key: string) {
  const [r] = await db.select().from(reservations).where(eq(reservations.idempotencyKey, key));
  return r;
}

function sameKeyResult(actor: Actor, r: Reservation, data: { vehicleId: string; pickupAt: Date; returnAt: Date }): HoldResult {
  if (
    r.userId !== actor.id ||
    r.vehicleId !== data.vehicleId ||
    r.pickupAt.getTime() !== data.pickupAt.getTime() ||
    r.returnAt.getTime() !== data.returnAt.getTime()
  ) {
    throw new DomainError("IDEMPOTENCY_CONFLICT", "This request key was already used for a different booking");
  }
  return { reservationId: r.id, reference: r.reference, holdExpiresAt: r.holdExpiresAt ?? r.createdAt, quote: r.priceBreakdown as Quote };
}

// ---------------------------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------------------------

/**
 * Charges the rental total and pre-authorises the deposit with the provider's verified responses
 * (webhooks are applied by the same idempotent code). The reservation is CONFIRMED only when the
 * payment has succeeded AND the deposit is held AND the hold has not expired.
 */
export async function payReservation(actor: Actor, input: PayReservationInput, opts: { now?: Date } = {}): Promise<PaymentOutcome> {
  const data = parseInput(payReservationSchema, input);
  const r = await loadOwned(actor, data.reservationId);
  if (r.userId !== actor.id) throw new DomainError("FORBIDDEN", "Only the customer can pay for this booking");
  const now = opts.now ?? new Date();

  if (r.status === "CONFIRMED") return outcome(r.id, now);
  if (r.status === "EXPIRED") throw new DomainError("HOLD_EXPIRED", "Your booking hold expired. Please search again.");
  if (r.status !== "PENDING") throw invalidState(`This booking is ${r.status.toLowerCase()}`);
  if (!r.holdExpiresAt || r.holdExpiresAt <= now) {
    await db.transaction((tx) => expireReservation(tx, r.id, now, "Hold expired before payment"));
    await settleAll([r.id], now);
    throw new DomainError("HOLD_EXPIRED", "Your booking hold expired. Please search again.");
  }

  const money = await moneyState(db, r.id);
  if (money.paidFils < r.totalFils) {
    const p = await chargeRental({
      reservationId: r.id,
      amountFils: r.totalFils - money.paidFils,
      paymentMethod: data.paymentMethod,
      idempotencyKey: data.idempotencyKey,
      now,
    });
    if (p.status !== "SUCCEEDED") return outcome(r.id, now, p.failureReason ?? "payment_failed");
  }
  if (!money.heldDeposit && r.depositFils > 0) {
    const d = await holdDeposit({
      reservationId: r.id,
      amountFils: r.depositFils,
      paymentMethod: data.paymentMethod,
      idempotencyKey: data.idempotencyKey,
      now,
    });
    if (d.status !== "HELD") return outcome(r.id, now, d.failureReason ?? "deposit_failed");
  }
  return outcome(r.id, now);
}

async function outcome(id: string, now: Date, failureReason?: string): Promise<PaymentOutcome> {
  const [r] = await db.select().from(reservations).where(eq(reservations.id, id));
  const [p] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.reservationId, id), eq(payments.kind, "RENTAL")))
    .orderBy(desc(payments.attempt))
    .limit(1);
  const [d] = await db.select().from(deposits).where(eq(deposits.reservationId, id)).orderBy(desc(deposits.attempt)).limit(1);
  const canRetry = r.status === "PENDING" && !!r.holdExpiresAt && r.holdExpiresAt > now;
  return {
    reservationStatus: r.status,
    paymentStatus: p?.status ?? null,
    depositStatus: d?.status ?? null,
    ...(failureReason && r.status !== "CONFIRMED" ? { failureReason } : {}),
    canRetry,
  };
}

/** Customer abandons checkout: PENDING → CANCELLED, any money returned. */
export async function cancelPendingReservation(actor: Actor, id: string): Promise<void> {
  const r = await loadOwned(actor, id);
  if (r.status === "CANCELLED" || r.status === "EXPIRED") return;
  if (r.status !== "PENDING") throw invalidState("Only unpaid bookings can be abandoned; use cancel instead");
  const changed = await db.transaction(async (tx) => {
    const res = await tx
      .update(reservations)
      .set({ status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Checkout abandoned" })
      .where(and(eq(reservations.id, id), eq(reservations.status, "PENDING")))
      .returning({ id: reservations.id });
    if (res[0]) {
      await writeAudit(tx, {
        actor,
        action: "reservation.cancelled",
        entityType: "reservation",
        entityId: id,
        before: { status: "PENDING" },
        after: { status: "CANCELLED" },
        metadata: { reason: "Checkout abandoned" },
      });
    }
    return res.length > 0;
  });
  if (changed) await settleAbandonedReservation(id);
}

// ---------------------------------------------------------------------------------------------
// Customer views
// ---------------------------------------------------------------------------------------------

export async function listMyReservations(actor: Actor): Promise<ReservationSummary[]> {
  assertActor(actor);
  return loadSummaries(db, eq(reservations.userId, actor.id));
}

export async function getMyReservation(actor: Actor, id: string): Promise<ReservationDetail> {
  const r = await loadOwned(actor, id);
  const detail = await loadReservationDetail(db, r.id);
  if (!detail) throw new DomainError("NOT_FOUND", "Reservation not found");
  return detail;
}

export async function getVoucher(actor: Actor, id: string) {
  const reservation = await getMyReservation(actor, id);
  if (!reservation.voucherAvailable) throw invalidState("A voucher is available once the booking is confirmed");
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const payload = `${base}/admin/reservations?q=${encodeURIComponent(reservation.reference)}`;
  const qrDataUrl = await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 240 });
  return { reference: reservation.reference, qrPayload: payload, qrDataUrl, reservation };
}

// ---------------------------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------------------------

export async function getCancellationQuote(actor: Actor, id: string, opts: { now?: Date } = {}) {
  const r = await loadOwned(actor, id);
  const money = await moneyState(db, r.id);
  const result = cancellationRefund({ status: r.status, pickupAt: r.pickupAt, now: opts.now ?? new Date(), paidFils: money.paidFils });
  return { ...result, policy: [...CANCELLATION_POLICY.rules] };
}

export async function cancelReservation(actor: Actor, id: string, input: { reason?: string } = {}, opts: { now?: Date } = {}) {
  const r = await loadOwned(actor, id);
  const { reason } = parseInput(cancelSchema, input);
  await cancelCore(actor, r, reason ?? "Cancelled by customer", undefined, opts.now ?? new Date());
  return getMyReservation(actor, id);
}

/** Shared by customer and admin cancellation. `refundOverride` (admin only) replaces the policy amount. */
export async function cancelCore(actor: Actor, r: Reservation, reason: string, refundOverride: number | undefined, now: Date) {
  const money = await moneyState(db, r.id);
  const policy = cancellationRefund({ status: r.status, pickupAt: r.pickupAt, now, paidFils: money.paidFils });
  const adminOverride = refundOverride !== undefined && actor.role === "ADMIN";
  if (!policy.eligible && !(adminOverride && (r.status === "PENDING" || r.status === "CONFIRMED"))) {
    throw invalidState(policy.reason);
  }
  const refund = Math.min(money.paidFils, adminOverride ? refundOverride! : policy.refundFils);
  const wasPending = r.status === "PENDING";

  const changed = await db.transaction(async (tx) => {
    const res = await tx
      .update(reservations)
      .set({ status: "CANCELLED", cancelledAt: now, cancellationReason: reason })
      .where(and(eq(reservations.id, r.id), inArray(reservations.status, ["PENDING", "CONFIRMED"])))
      .returning({ id: reservations.id });
    if (!res[0]) return false;
    await writeAudit(tx, {
      actor,
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: r.id,
      before: { status: r.status },
      after: { status: "CANCELLED" },
      metadata: { reason, policy, refundPlannedFils: refund, adminOverride },
    });
    return true;
  });
  if (!changed) throw invalidState("This booking can no longer be cancelled");

  let refunded = 0;
  try {
    refunded = wasPending ? 0 : await refundRental(r.id, refund, now);
    if (wasPending) await settleAbandonedReservation(r.id, now);
    else await releaseHeldDeposits(r.id, now);
  } catch (err) {
    log.error("Refund/release after cancellation failed", { reservationId: r.id, err });
  }
  if (wasPending) refunded = money.paidFils;
  if (refunded > 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(reservations)
        .set({ status: "REFUNDED", refundFils: sql`${reservations.refundFils} + ${refunded}` })
        .where(eq(reservations.id, r.id));
      await writeAudit(tx, {
        actor,
        action: "reservation.refunded",
        entityType: "reservation",
        entityId: r.id,
        before: { status: "CANCELLED" },
        after: { status: "REFUNDED", refundFils: refunded },
      });
    });
  }
  return { refundedFils: refunded };
}

// ---------------------------------------------------------------------------------------------
// Date changes
// ---------------------------------------------------------------------------------------------

async function selectionFor(r: Reservation) {
  const rows = await db
    .select({ extraId: reservationExtras.extraId, quantity: reservationExtras.quantity, active: extrasTable.isActive })
    .from(reservationExtras)
    .innerJoin(extrasTable, eq(extrasTable.id, reservationExtras.extraId))
    .where(eq(reservationExtras.reservationId, r.id));
  // Extras that were retired since booking are dropped from the re-quote.
  return rows.filter((x) => x.active).map((x) => ({ extraId: x.extraId, quantity: x.quantity }));
}

export async function quoteDateChange(actor: Actor, id: string, input: DateChangeInput, opts: { now?: Date } = {}) {
  const r = await loadOwned(actor, id);
  const data = parseInput(dateChangeSchema, input);
  const now = opts.now ?? new Date();
  assertModifiable(r, data.pickupAt, now);
  const { quote } = await buildQuote(db, {
    vehicleId: r.vehicleId,
    pickupBranchId: r.pickupBranchId,
    returnBranchId: r.returnBranchId,
    pickupAt: data.pickupAt,
    returnAt: data.returnAt,
    extras: await selectionFor(r),
  });
  const conflict = await db.transaction(async (tx) => {
    await expireStaleHoldsForVehicle(tx, r.vehicleId, now);
    return hasConflict(tx, r.vehicleId, data.pickupAt, data.returnAt, r.id);
  });
  return { available: !conflict, quote, currentTotalFils: r.totalFils, differenceFils: quote.totalFils - r.totalFils };
}

function assertModifiable(r: Reservation, newPickup: Date, now: Date) {
  if (r.status !== "CONFIRMED") throw invalidState("Only confirmed bookings can be changed");
  if (r.pickupAt <= now) throw invalidState("Bookings cannot be changed after the pick-up time");
  if (newPickup <= now) throw new DomainError("VALIDATION", "Pick-up time is in the past", { fieldErrors: { pickupAt: ["Choose a future time"] } });
}

export async function modifyReservationDates(actor: Actor, id: string, input: ModifyDatesInput, opts: { now?: Date } = {}) {
  const r = await loadOwned(actor, id);
  const data = parseInput(modifyDatesSchema, input);
  const now = opts.now ?? new Date();
  if (r.pickupAt.getTime() === data.pickupAt.getTime() && r.returnAt.getTime() === data.returnAt.getTime()) {
    return getMyReservation(actor, id); // retried request, already applied
  }
  assertModifiable(r, data.pickupAt, now);
  if (data.returnAt.getTime() - data.pickupAt.getTime() > MAX_RENTAL_DAYS * 86_400_000) {
    throw new DomainError("VALIDATION", `Rentals are limited to ${MAX_RENTAL_DAYS} days`);
  }
  const selection = await selectionFor(r);
  const quoteInput = {
    vehicleId: r.vehicleId,
    pickupBranchId: r.pickupBranchId,
    returnBranchId: r.returnBranchId,
    pickupAt: data.pickupAt,
    returnAt: data.returnAt,
    extras: selection,
  };
  const { quote } = await buildQuote(db, quoteInput);
  const diff = quote.totalFils - r.totalFils;

  // Availability first so we never charge for dates we cannot give.
  if (await hasConflict(db, r.vehicleId, data.pickupAt, data.returnAt, r.id)) {
    const stillBlocked = await db.transaction(async (tx) => {
      await expireStaleHoldsForVehicle(tx, r.vehicleId, now);
      return hasConflict(tx, r.vehicleId, data.pickupAt, data.returnAt, r.id);
    });
    if (stillBlocked) throw vehicleUnavailable();
  }

  let charged = 0;
  if (diff > 0) {
    if (!data.paymentMethod) {
      throw new DomainError("VALIDATION", "A payment method is needed for the price difference", {
        fieldErrors: { paymentMethod: ["Required"] },
        details: { differenceFils: diff },
      });
    }
    const p = await chargeRental({ reservationId: r.id, amountFils: diff, paymentMethod: data.paymentMethod, idempotencyKey: data.idempotencyKey, now });
    if (p.status !== "SUCCEEDED") {
      throw new DomainError("PAYMENT_DECLINED", "The payment for the price difference was declined", { details: { reason: p.failureReason } });
    }
    charged = diff;
  }

  let stale: string[] = [];
  try {
    await db.transaction(async (tx) => {
      await lockVehicle(tx, r.vehicleId);
      const [cur] = await tx.select().from(reservations).where(eq(reservations.id, r.id)).for("update");
      if (cur.status !== "CONFIRMED" || cur.totalFils !== r.totalFils || cur.pickupAt.getTime() !== r.pickupAt.getTime()) {
        throw new DomainError("CONFLICT", "The booking changed meanwhile; please try again");
      }
      stale = await expireStaleHoldsForVehicle(tx, r.vehicleId, now);
      if (await hasConflict(tx, r.vehicleId, data.pickupAt, data.returnAt, r.id)) throw vehicleUnavailable();
      const again = (await buildQuote(tx, quoteInput)).quote;
      if (again.totalFils !== quote.totalFils) throw new DomainError("CONFLICT", "Prices changed meanwhile; please review the new quote");
      await tx
        .update(reservations)
        .set({
          pickupAt: data.pickupAt,
          returnAt: data.returnAt,
          rentalDays: quote.days,
          dailyRateFils: quote.dailyRateFils,
          baseFils: quote.rentalFils,
          extrasFils: quote.extrasFils,
          oneWayFeeFils: quote.oneWayFeeFils,
          subtotalFils: quote.subtotalFils,
          vatFils: quote.vatFils,
          totalFils: quote.totalFils,
          pricingRuleId: quote.pricingRuleId,
          priceBreakdown: quote,
        })
        .where(eq(reservations.id, r.id));
      await tx.delete(reservationExtras).where(eq(reservationExtras.reservationId, r.id));
      if (quote.extras.length) {
        await tx.insert(reservationExtras).values(
          quote.extras.map((e) => ({
            reservationId: r.id,
            extraId: e.extraId,
            name: e.name,
            chargeType: e.chargeType,
            quantity: e.quantity,
            unitPriceFils: e.unitFils,
            totalFils: e.totalFils,
          })),
        );
      }
      await writeAudit(tx, {
        actor,
        action: "reservation.dates_changed",
        entityType: "reservation",
        entityId: r.id,
        before: { pickupAt: r.pickupAt, returnAt: r.returnAt, totalFils: r.totalFils },
        after: { pickupAt: data.pickupAt, returnAt: data.returnAt, totalFils: quote.totalFils },
        metadata: { differenceFils: diff },
      });
    });
  } catch (err) {
    if (charged > 0) {
      await refundRental(r.id, charged, now).catch((e) => log.error("Refund of date-change charge failed", { reservationId: r.id, err: e }));
    }
    throw toDomainError(err);
  }
  if (stale.length) await settleAll(stale, now);
  if (diff < 0) {
    await refundRental(r.id, -diff, now).catch((err) => log.error("Refund after date change failed", { reservationId: r.id, err }));
  }
  return getMyReservation(actor, id);
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
