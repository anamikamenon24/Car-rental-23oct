import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { branches, extras, pricingRules, vehicleCategories, vehicles } from "@/db/schema";
import { db, type DbOrTx } from "./db";
import { DomainError, parseInput } from "./errors";
import { calculateQuote, oneWayFee, rentalDays, selectPricingRule, type Quote } from "./pricing";
import { quoteSchema, type QuoteInput } from "./validation";

export type { Quote };

export interface ParsedQuoteInput {
  vehicleId: string;
  pickupBranchId: string;
  returnBranchId: string;
  pickupAt: Date;
  returnAt: Date;
  extras: { extraId: string; quantity: number }[];
}

/** Server-side price for a rental (never trust a client-computed price). */
export async function quoteRental(input: QuoteInput): Promise<Quote> {
  const parsed = parseInput(quoteSchema, input);
  return (await buildQuote(db, parsed)).quote;
}

/**
 * Loads everything needed and prices the rental. Used by quoteRental and inside the reservation
 * transaction. Validates branches, vehicle location, extras and quantities.
 */
export async function buildQuote(tx: DbOrTx, q: ParsedQuoteInput) {
  const [row] = await tx
    .select({ v: vehicles, c: vehicleCategories })
    .from(vehicles)
    .innerJoin(vehicleCategories, eq(vehicleCategories.id, vehicles.categoryId))
    .where(eq(vehicles.id, q.vehicleId));
  if (!row || row.v.status === "RETIRED") throw new DomainError("NOT_FOUND", "Vehicle not found");

  const branchRows = await tx.select().from(branches).where(inArray(branches.id, [q.pickupBranchId, q.returnBranchId]));
  const pickup = branchRows.find((b) => b.id === q.pickupBranchId);
  const ret = branchRows.find((b) => b.id === q.returnBranchId);
  if (!pickup?.isActive) throw new DomainError("VALIDATION", "Pick-up branch not found", { fieldErrors: { pickupBranchId: ["Unknown branch"] } });
  if (!ret?.isActive) throw new DomainError("VALIDATION", "Return branch not found", { fieldErrors: { returnBranchId: ["Unknown branch"] } });
  if (row.v.branchId !== pickup.id) {
    throw new DomainError("VALIDATION", "This vehicle is not available at the selected pick-up branch", {
      fieldErrors: { pickupBranchId: ["Vehicle is based at another branch"] },
    });
  }

  const days = rentalDays(q.pickupAt, q.returnAt);
  const rules = await tx
    .select()
    .from(pricingRules)
    .where(and(eq(pricingRules.categoryId, row.c.id), eq(pricingRules.isActive, true)));
  const rule = selectPricingRule(rules, {
    categoryId: row.c.id,
    branchId: pickup.id,
    days,
    pickupAt: q.pickupAt,
    timeZone: pickup.timeZone,
  });
  if (!rule) throw new DomainError("PRICE_UNAVAILABLE", "No price is configured for this vehicle and these dates");

  const ids = [...new Set(q.extras.map((e) => e.extraId))];
  if (ids.length !== q.extras.length) throw new DomainError("VALIDATION", "Each extra can only be selected once");
  const extraRows = ids.length ? await tx.select().from(extras).where(inArray(extras.id, ids)) : [];
  const selected = q.extras.map((sel) => {
    const extra = extraRows.find((e) => e.id === sel.extraId);
    if (!extra || !extra.isActive) throw new DomainError("VALIDATION", "Unknown extra", { fieldErrors: { extras: ["Unknown extra"] } });
    if (sel.quantity > extra.maxQuantity) {
      throw new DomainError("VALIDATION", `At most ${extra.maxQuantity} × ${extra.name}`, {
        fieldErrors: { extras: [`At most ${extra.maxQuantity} × ${extra.name}`] },
      });
    }
    return { extra, quantity: sel.quantity };
  });

  const quote = calculateQuote({
    pickupAt: q.pickupAt,
    returnAt: q.returnAt,
    dailyRateFils: rule.dailyRateFils,
    pricingRuleId: rule.id,
    extras: selected,
    oneWayFeeFils: oneWayFee(pickup, ret),
    depositFils: row.c.depositFils,
  });
  return { quote, vehicle: row.v, category: row.c, pickupBranch: pickup, returnBranch: ret };
}
