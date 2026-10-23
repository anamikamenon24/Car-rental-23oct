// Pure pricing rules (no DB, no I/O). Every amount is integer fils (1 AED = 100 fils).
// This is the single source of truth for rental days, rule selection, extras, one-way fees,
// VAT, deposits, late-return and fuel charges and the cancellation policy.
import { CANCELLATION_POLICY, VAT_RATE_BPS } from "@/lib/constants";
import { localDate } from "@/lib/time";

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Up to 59 minutes past a 24h block (or past the scheduled return) is not charged. */
export const GRACE_MINUTES = 59;
/** One-way fee when the return branch differs: same city / different city. */
export const ONE_WAY_FEE_SAME_CITY_FILS = 10_000; // AED 100
export const ONE_WAY_FEE_INTERCITY_FILS = 25_000; // AED 250
/** Late return: each started hour after the grace costs 25% of the daily rate, capped at one day per 24h. */
export const LATE_HOURLY_RATE_BPS = 2_500;
/** Refuelling charge per missing eighth of a tank. */
export const FUEL_CHARGE_PER_EIGHTH_FILS = 3_500; // AED 35
export { VAT_RATE_BPS };

/** Round half up for non-negative integers: (amount * bps) / 10000. */
export function applyBps(amountFils: number, bps: number): number {
  assertFils(amountFils);
  return Math.floor((amountFils * bps + 5_000) / 10_000);
}

export function vatOn(amountFils: number, vatRateBps = VAT_RATE_BPS): number {
  return applyBps(amountFils, vatRateBps);
}

function assertFils(n: number) {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Invalid fils amount: ${n}`);
}

/** Days charged = ceil((duration - 59 min) / 24h), minimum 1. */
export function rentalDays(pickupAt: Date, returnAt: Date): number {
  const ms = returnAt.getTime() - pickupAt.getTime();
  if (!(ms > 0)) throw new RangeError("Return must be after pick-up");
  return Math.max(1, Math.ceil((ms - GRACE_MINUTES * MINUTE_MS) / DAY_MS));
}

// ---------------------------------------------------------------------------------------------
// Pricing rule selection
// ---------------------------------------------------------------------------------------------

export interface PricingRuleLike {
  id: string;
  categoryId: string;
  branchId: string | null;
  dailyRateFils: number;
  minDays: number;
  validFrom: string | null; // YYYY-MM-DD
  validTo: string | null;
  priority: number;
  isActive: boolean;
}

/**
 * Picks the one rule that prices the whole rental. A rule matches when it is active, for the
 * category, for the pick-up branch or all branches (null), `minDays <= days`, and the pick-up date
 * (in the pick-up branch's local time) is inside [validFrom, validTo] (open ends allowed).
 * Tie-break: higher priority, then higher minDays (longer-rental tier), then branch-specific over
 * all-branch, then lower rate, then id.
 */
export function selectPricingRule<T extends PricingRuleLike>(
  rules: readonly T[],
  q: { categoryId: string; branchId: string; days: number; pickupAt: Date; timeZone: string },
): T | null {
  const date = localDate(q.pickupAt, q.timeZone);
  const matches = rules.filter(
    (r) =>
      r.isActive &&
      r.categoryId === q.categoryId &&
      (r.branchId === null || r.branchId === q.branchId) &&
      r.minDays <= q.days &&
      (r.validFrom === null || r.validFrom <= date) &&
      (r.validTo === null || r.validTo >= date),
  );
  matches.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.minDays - a.minDays ||
      Number(b.branchId !== null) - Number(a.branchId !== null) ||
      a.dailyRateFils - b.dailyRateFils ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return matches[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Extras, one-way fee, quote
// ---------------------------------------------------------------------------------------------

export interface ExtraLike {
  id: string;
  code: string;
  name: string;
  chargeType: "PER_DAY" | "PER_RENTAL";
  priceFils: number;
  maxChargeFils: number | null;
  maxQuantity: number;
}

export interface QuoteExtraLine {
  extraId: string;
  code: string;
  name: string;
  chargeType: "PER_DAY" | "PER_RENTAL";
  quantity: number;
  /** Charge for one unit over the whole rental, after the cap. */
  unitFils: number;
  totalFils: number;
}

/** PER_DAY: price × days, PER_RENTAL: price; capped at maxChargeFils per unit; × quantity. */
export function extraCharge(extra: ExtraLike, days: number, quantity: number): QuoteExtraLine {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > extra.maxQuantity) {
    throw new RangeError(`Quantity for ${extra.name} must be between 1 and ${extra.maxQuantity}`);
  }
  let unit = extra.chargeType === "PER_DAY" ? extra.priceFils * days : extra.priceFils;
  if (extra.maxChargeFils !== null) unit = Math.min(unit, extra.maxChargeFils);
  return {
    extraId: extra.id,
    code: extra.code,
    name: extra.name,
    chargeType: extra.chargeType,
    quantity,
    unitFils: unit,
    totalFils: unit * quantity,
  };
}

export function oneWayFee(
  pickup: { id: string; city: string },
  ret: { id: string; city: string },
): number {
  if (pickup.id === ret.id) return 0;
  return pickup.city.trim().toLowerCase() === ret.city.trim().toLowerCase()
    ? ONE_WAY_FEE_SAME_CITY_FILS
    : ONE_WAY_FEE_INTERCITY_FILS;
}

export interface Quote {
  currency: "AED";
  days: number;
  dailyRateFils: number;
  rentalFils: number;
  extras: QuoteExtraLine[];
  extrasFils: number;
  oneWayFeeFils: number;
  subtotalFils: number;
  vatRateBps: number;
  vatFils: number;
  totalFils: number;
  depositFils: number;
  pricingRuleId: string | null;
  lines: { label: string; amountFils: number }[];
}

export interface CalculateQuoteInput {
  pickupAt: Date;
  returnAt: Date;
  dailyRateFils: number;
  pricingRuleId?: string | null;
  extras?: { extra: ExtraLike; quantity: number }[];
  oneWayFeeFils?: number;
  depositFils: number;
}

/** Full price: rental + extras + one-way fee, VAT 5% on the subtotal (all lines taxable). Deposit is separate. */
export function calculateQuote(input: CalculateQuoteInput): Quote {
  const days = rentalDays(input.pickupAt, input.returnAt);
  assertFils(input.dailyRateFils);
  assertFils(input.depositFils);
  const oneWay = input.oneWayFeeFils ?? 0;
  assertFils(oneWay);
  const rentalFils = input.dailyRateFils * days;
  const extras = (input.extras ?? []).map((e) => extraCharge(e.extra, days, e.quantity));
  const extrasFils = extras.reduce((s, e) => s + e.totalFils, 0);
  const subtotalFils = rentalFils + extrasFils + oneWay;
  const vatFils = vatOn(subtotalFils);
  const lines = [
    { label: `Rental: ${days} day${days === 1 ? "" : "s"} × ${(input.dailyRateFils / 100).toFixed(2)}`, amountFils: rentalFils },
    ...extras.map((e) => ({ label: e.quantity > 1 ? `${e.name} × ${e.quantity}` : e.name, amountFils: e.totalFils })),
    ...(oneWay ? [{ label: "One-way fee", amountFils: oneWay }] : []),
    { label: `VAT ${VAT_RATE_BPS / 100}%`, amountFils: vatFils },
  ];
  return {
    currency: "AED",
    days,
    dailyRateFils: input.dailyRateFils,
    rentalFils,
    extras,
    extrasFils,
    oneWayFeeFils: oneWay,
    subtotalFils,
    vatRateBps: VAT_RATE_BPS,
    vatFils,
    totalFils: subtotalFils + vatFils,
    depositFils: input.depositFils,
    pricingRuleId: input.pricingRuleId ?? null,
    lines,
  };
}

// ---------------------------------------------------------------------------------------------
// Return charges
// ---------------------------------------------------------------------------------------------

/**
 * Late return: free within 59 minutes of the scheduled return. Beyond that, each full 24h late
 * costs one daily rate, and the remaining part costs 25% of the daily rate per started hour,
 * capped at one daily rate.
 */
export function lateReturnCharge(scheduledReturnAt: Date, actualReturnAt: Date, dailyRateFils: number) {
  assertFils(dailyRateFils);
  const lateMs = actualReturnAt.getTime() - scheduledReturnAt.getTime();
  const lateMinutes = Math.max(0, Math.floor(lateMs / MINUTE_MS));
  if (lateMinutes <= GRACE_MINUTES) return { lateMinutes, chargeableHours: 0, feeFils: 0 };
  const fullDays = Math.floor(lateMs / DAY_MS);
  const remainderMs = lateMs - fullDays * DAY_MS;
  const hours = Math.ceil(remainderMs / HOUR_MS);
  const hourly = applyBps(dailyRateFils, LATE_HOURLY_RATE_BPS);
  const feeFils = fullDays * dailyRateFils + Math.min(hours * hourly, dailyRateFils);
  return { lateMinutes, chargeableHours: fullDays * 24 + hours, feeFils };
}

/** Refuelling: AED 35 per missing eighth (return level below pick-up level). */
export function fuelCharge(pickupEighths: number, returnEighths: number): number {
  return Math.max(0, pickupEighths - returnEighths) * FUEL_CHARGE_PER_EIGHTH_FILS;
}

export interface ReturnChargesInput {
  scheduledReturnAt: Date;
  actualReturnAt: Date;
  dailyRateFils: number;
  pickupFuelEighths: number;
  returnFuelEighths: number;
  chargeFuel: boolean;
  damageChargeFils: number;
  depositFils: number;
}

/** Charges at check-in (late + fuel + damage, VAT 5% on top), and how much of the deposit covers them. */
export function returnCharges(i: ReturnChargesInput) {
  const late = lateReturnCharge(i.scheduledReturnAt, i.actualReturnAt, i.dailyRateFils);
  const fuelChargeFils = i.chargeFuel ? fuelCharge(i.pickupFuelEighths, i.returnFuelEighths) : 0;
  assertFils(i.damageChargeFils);
  const net = late.feeFils + fuelChargeFils + i.damageChargeFils;
  const vatFils = vatOn(net);
  const totalFils = net + vatFils;
  const depositCaptureFils = Math.min(totalFils, i.depositFils);
  return {
    lateMinutes: late.lateMinutes,
    lateFeeFils: late.feeFils,
    fuelChargeFils,
    damageChargeFils: i.damageChargeFils,
    netFils: net,
    vatFils,
    totalFils,
    depositFils: i.depositFils,
    depositCaptureFils,
    depositReleaseFils: i.depositFils - depositCaptureFils,
    balanceDueFils: totalFils - depositCaptureFils,
  };
}

// ---------------------------------------------------------------------------------------------
// Cancellation policy
// ---------------------------------------------------------------------------------------------

export type CancellationResult = {
  eligible: boolean;
  refundPercent: number;
  refundFils: number;
  feeFils: number;
  reason: string;
};

/**
 * - Unpaid (PENDING): free, refund whatever was captured.
 * - CONFIRMED, at least 48h before pick-up: 100% of the amount paid.
 * - CONFIRMED, less than 48h before pick-up (but before it): 50%, rounded half up.
 * - At/after pick-up time, or PICKED_UP or later: not cancellable, no refund.
 */
export function cancellationRefund(i: { status: string; pickupAt: Date; now: Date; paidFils: number }): CancellationResult {
  assertFils(i.paidFils);
  const none = (reason: string): CancellationResult => ({ eligible: false, refundPercent: 0, refundFils: 0, feeFils: 0, reason });
  if (i.status === "PENDING") {
    return { eligible: true, refundPercent: 100, refundFils: i.paidFils, feeFils: 0, reason: "Unpaid booking: free cancellation" };
  }
  if (i.status !== "CONFIRMED") return none(`A ${i.status.toLowerCase().replace("_", " ")} booking cannot be cancelled`);
  const msBefore = i.pickupAt.getTime() - i.now.getTime();
  if (msBefore <= 0) return none("The pick-up time has passed");
  const percent =
    msBefore >= CANCELLATION_POLICY.freeCancellationHours * HOUR_MS ? 100 : CANCELLATION_POLICY.lateCancellationRefundPercent;
  const refundFils = applyBps(i.paidFils, percent * 100);
  return {
    eligible: true,
    refundPercent: percent,
    refundFils,
    feeFils: i.paidFils - refundFils,
    reason:
      percent === 100
        ? "Free cancellation: more than 48 hours before pick-up"
        : "Late cancellation: less than 48 hours before pick-up (50% refund)",
  };
}
