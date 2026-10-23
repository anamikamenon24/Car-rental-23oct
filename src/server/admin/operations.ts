import "server-only";
import { randomInt } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { deposits, rentalAgreements, reservations, vehicles, branches, type RentalAgreement } from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { db, writeAudit } from "../db";
import { DomainError, invalidState, parseInput, toDomainError } from "../errors";
import { log } from "../log";
import { settleDeposit } from "../payments";
import { returnCharges } from "../pricing";
import { checkInQuoteSchema, checkInSchema, checkOutSchema, type CheckInInput, type CheckInQuoteInput, type CheckOutInput } from "../validation";

/** Check-out is allowed from 24h before the scheduled pick-up. */
export const EARLY_PICKUP_HOURS = 24;

function agreementNumber(now: Date) {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `RA-${d}-${String(randomInt(1_000_000)).padStart(6, "0")}`;
}

/**
 * Hands the car over: creates the rental agreement (pick-up mileage + fuel), reservation → PICKED_UP,
 * vehicle → ON_RENT. Vehicle row is locked first (same lock order as bookings).
 */
export async function checkOut(actor: Actor, reservationId: string, input: CheckOutInput, opts: { now?: Date } = {}): Promise<RentalAgreement> {
  assertAdmin(actor);
  const d = parseInput(checkOutSchema, input);
  const now = opts.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const [r0] = await tx.select().from(reservations).where(eq(reservations.id, reservationId));
      if (!r0) throw new DomainError("NOT_FOUND", "Reservation not found");
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, r0.vehicleId)).for("update");
      const [r] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
      if (r.status !== "CONFIRMED") throw invalidState(`Only confirmed bookings can be checked out (this one is ${r.status})`);
      if (now.getTime() < r.pickupAt.getTime() - EARLY_PICKUP_HOURS * 3_600_000) {
        throw invalidState("Too early: check-out opens 24 hours before the pick-up time");
      }
      if (now >= r.returnAt) throw invalidState("The rental period has already ended");
      if (v.status === "ON_RENT" || v.status === "RETIRED" || v.status === "MAINTENANCE") {
        throw invalidState(`The vehicle is ${v.status.toLowerCase().replace("_", " ")}`);
      }
      if (d.mileageKm < v.mileageKm) {
        throw new DomainError("VALIDATION", `Mileage cannot be below the last recorded ${v.mileageKm} km`, {
          fieldErrors: { mileageKm: [`At least ${v.mileageKm}`] },
        });
      }
      const [held] = await tx
        .select({ id: deposits.id })
        .from(deposits)
        .where(and(eq(deposits.reservationId, r.id), eq(deposits.status, "HELD")));
      if (!held && r.depositFils > 0) throw invalidState("No security deposit is held for this booking");

      const [a] = await tx
        .insert(rentalAgreements)
        .values({
          reservationId: r.id,
          agreementNumber: agreementNumber(now),
          vehicleId: v.id,
          checkedOutAt: now,
          checkedOutBy: actor.id,
          pickupMileageKm: d.mileageKm,
          pickupFuelEighths: d.fuelEighths,
          pickupNotes: d.notes ?? null,
        })
        .returning();
      await tx.update(reservations).set({ status: "PICKED_UP", pickedUpAt: now }).where(eq(reservations.id, r.id));
      await tx.update(vehicles).set({ status: "ON_RENT", mileageKm: d.mileageKm }).where(eq(vehicles.id, v.id));
      await writeAudit(tx, { actor, action: "rental_agreement.created", entityType: "rental_agreement", entityId: a.id, after: a, metadata: { reservationId: r.id } });
      await writeAudit(tx, { actor, action: "reservation.picked_up", entityType: "reservation", entityId: r.id, before: { status: r.status }, after: { status: "PICKED_UP" } });
      await writeAudit(tx, {
        actor,
        action: "vehicle.status_changed",
        entityType: "vehicle",
        entityId: v.id,
        before: { status: v.status, mileageKm: v.mileageKm },
        after: { status: "ON_RENT", mileageKm: d.mileageKm },
        metadata: { reservationId: r.id },
      });
      return a;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

export interface CheckInQuote {
  lateMinutes: number;
  lateFeeFils: number;
  fuelChargeFils: number;
  damageChargeFils: number;
  netFils: number;
  vatFils: number;
  totalFils: number;
  depositFils: number;
  depositCaptureFils: number;
  depositReleaseFils: number;
  balanceDueFils: number;
  returnedAt: Date;
}

async function loadForReturn(reservationId: string) {
  const [r] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!r) throw new DomainError("NOT_FOUND", "Reservation not found");
  const [a] = await db.select().from(rentalAgreements).where(eq(rentalAgreements.reservationId, r.id));
  return { r, a };
}

function computeReturn(
  r: typeof reservations.$inferSelect,
  a: RentalAgreement,
  d: ReturnType<typeof checkInQuoteSchema.parse>,
  now: Date,
): CheckInQuote {
  const returnedAt = d.returnedAt ?? now;
  if (returnedAt < a.checkedOutAt) throw new DomainError("VALIDATION", "Return time is before the check-out time", { fieldErrors: { returnedAt: ["Too early"] } });
  if (d.mileageKm < a.pickupMileageKm) {
    throw new DomainError("VALIDATION", `Mileage cannot be below the pick-up reading of ${a.pickupMileageKm} km`, {
      fieldErrors: { mileageKm: [`At least ${a.pickupMileageKm}`] },
    });
  }
  const c = returnCharges({
    scheduledReturnAt: r.returnAt,
    actualReturnAt: returnedAt,
    dailyRateFils: r.dailyRateFils,
    pickupFuelEighths: a.pickupFuelEighths,
    returnFuelEighths: d.fuelEighths,
    chargeFuel: d.chargeFuel,
    damageChargeFils: d.damageChargeFils,
    depositFils: r.depositFils,
  });
  return { ...c, returnedAt };
}

export async function quoteCheckIn(actor: Actor, reservationId: string, input: CheckInQuoteInput, opts: { now?: Date } = {}): Promise<CheckInQuote> {
  assertAdmin(actor);
  const d = parseInput(checkInQuoteSchema, input);
  const { r, a } = await loadForReturn(reservationId);
  if (r.status !== "PICKED_UP" || !a) throw invalidState("Only picked-up rentals can be checked in");
  return computeReturn(r, a, d, opts.now ?? new Date());
}

/**
 * Takes the car back: agreement gets return mileage/fuel and charges, reservation → RETURNED,
 * vehicle → AVAILABLE at the return branch. Then the deposit is released or (partially) captured:
 * AUTO captures the charges up to the deposit, RELEASE releases it all (charges become balance
 * due), CAPTURE captures `captureFils` (default: the charges).
 */
export async function checkIn(actor: Actor, reservationId: string, input: CheckInInput, opts: { now?: Date } = {}): Promise<RentalAgreement> {
  assertAdmin(actor);
  const d = parseInput(checkInSchema, input);
  const now = opts.now ?? new Date();
  let quote: CheckInQuote;
  let plannedCapture = 0;
  let agreementId: string;
  try {
    ({ quote, plannedCapture, agreementId } = await db.transaction(async (tx) => {
      const [r0] = await tx.select().from(reservations).where(eq(reservations.id, reservationId));
      if (!r0) throw new DomainError("NOT_FOUND", "Reservation not found");
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, r0.vehicleId)).for("update");
      const [r] = await tx.select().from(reservations).where(eq(reservations.id, reservationId)).for("update");
      const [a] = await tx.select().from(rentalAgreements).where(eq(rentalAgreements.reservationId, r.id)).for("update");
      if (r.status !== "PICKED_UP" || !a) throw invalidState(`Only picked-up rentals can be checked in (this one is ${r.status})`);
      const returnBranchId = d.returnBranchId ?? r.returnBranchId;
      const [rb] = await tx.select({ id: branches.id }).from(branches).where(eq(branches.id, returnBranchId));
      if (!rb) throw new DomainError("VALIDATION", "Unknown return branch", { fieldErrors: { returnBranchId: ["Unknown branch"] } });

      const q = computeReturn(r, a, d, now);
      const capture =
        d.depositAction === "RELEASE" ? 0 : d.depositAction === "CAPTURE" ? Math.min(d.captureFils ?? q.depositCaptureFils, r.depositFils) : q.depositCaptureFils;

      const [updated] = await tx
        .update(rentalAgreements)
        .set({
          checkedInAt: q.returnedAt,
          checkedInBy: actor.id,
          returnBranchId,
          returnMileageKm: d.mileageKm,
          returnFuelEighths: d.fuelEighths,
          returnNotes: d.notes ?? null,
          lateMinutes: q.lateMinutes,
          lateFeeFils: q.lateFeeFils,
          fuelChargeFils: q.fuelChargeFils,
          damageChargeFils: q.damageChargeFils,
          additionalVatFils: q.vatFils,
          additionalTotalFils: q.totalFils,
          depositCapturedFils: 0,
          balanceDueFils: q.totalFils,
        })
        .where(eq(rentalAgreements.id, a.id))
        .returning();
      await tx.update(reservations).set({ status: "RETURNED", returnedAt: q.returnedAt }).where(eq(reservations.id, r.id));
      await tx
        .update(vehicles)
        .set({ status: "AVAILABLE", mileageKm: d.mileageKm, branchId: returnBranchId })
        .where(eq(vehicles.id, v.id));
      await writeAudit(tx, { actor, action: "rental_agreement.checked_in", entityType: "rental_agreement", entityId: a.id, before: a, after: updated, metadata: { reservationId: r.id } });
      await writeAudit(tx, { actor, action: "reservation.returned", entityType: "reservation", entityId: r.id, before: { status: "PICKED_UP" }, after: { status: "RETURNED" } });
      await writeAudit(tx, {
        actor,
        action: "vehicle.status_changed",
        entityType: "vehicle",
        entityId: v.id,
        before: { status: v.status, mileageKm: v.mileageKm, branchId: v.branchId },
        after: { status: "AVAILABLE", mileageKm: d.mileageKm, branchId: returnBranchId },
        metadata: { reservationId: r.id },
      });
      return { quote: q, plannedCapture: capture, agreementId: a.id };
    }));
  } catch (err) {
    throw toDomainError(err);
  }

  // Money moves after the commit (never hold DB locks across provider calls).
  let captured = 0;
  try {
    const res = await settleDeposit(reservationId, plannedCapture, now);
    captured = res.capturedFils;
  } catch (err) {
    log.error("Deposit settlement at check-in failed", { reservationId, err });
  }
  return db.transaction(async (tx) => {
    const [a] = await tx
      .update(rentalAgreements)
      .set({ depositCapturedFils: captured, balanceDueFils: Math.max(0, quote.totalFils - captured) })
      .where(eq(rentalAgreements.id, agreementId))
      .returning();
    await writeAudit(tx, {
      actor,
      action: captured > 0 ? "deposit.captured_at_check_in" : "deposit.released_at_check_in",
      entityType: "rental_agreement",
      entityId: agreementId,
      after: { depositCapturedFils: captured, balanceDueFils: a.balanceDueFils },
      metadata: { reservationId, depositAction: d.depositAction },
    });
    return a;
  });
}
