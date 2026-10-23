import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { branches, extras, pricingRules, vehicleCategories, type Extra, type PricingRule } from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { db, writeAudit } from "../db";
import { DomainError, parseInput, toDomainError } from "../errors";
import { extraSchema, pricingRuleSchema, type ExtraInput, type PricingRuleInput } from "../validation";

export interface PricingRuleRow extends PricingRule {
  categoryName: string;
  branchName: string | null;
}

export async function listPricingRules(actor: Actor): Promise<PricingRuleRow[]> {
  assertAdmin(actor);
  const rows = await db
    .select({ r: pricingRules, categoryName: vehicleCategories.name, branchName: branches.name })
    .from(pricingRules)
    .innerJoin(vehicleCategories, eq(vehicleCategories.id, pricingRules.categoryId))
    .leftJoin(branches, eq(branches.id, pricingRules.branchId))
    .orderBy(asc(vehicleCategories.sortOrder), desc(pricingRules.priority), asc(pricingRules.minDays));
  return rows.map((x) => ({ ...x.r, categoryName: x.categoryName, branchName: x.branchName }));
}

function ruleValues(d: ReturnType<typeof pricingRuleSchema.parse>) {
  return {
    name: d.name,
    categoryId: d.categoryId,
    branchId: d.branchId ?? null,
    dailyRateFils: d.dailyRateFils,
    minDays: d.minDays,
    validFrom: d.validFrom ?? null,
    validTo: d.validTo ?? null,
    priority: d.priority,
    isActive: d.isActive,
  };
}

export async function createPricingRule(actor: Actor, input: PricingRuleInput): Promise<PricingRule> {
  assertAdmin(actor);
  const d = parseInput(pricingRuleSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [r] = await tx.insert(pricingRules).values(ruleValues(d)).returning();
      await writeAudit(tx, { actor, action: "pricing_rule.created", entityType: "pricing_rule", entityId: r.id, after: r });
      return r;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

export async function updatePricingRule(actor: Actor, id: string, input: PricingRuleInput): Promise<PricingRule> {
  assertAdmin(actor);
  const d = parseInput(pricingRuleSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(pricingRules).where(eq(pricingRules.id, id)).for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Pricing rule not found");
      const [r] = await tx.update(pricingRules).set(ruleValues(d)).where(eq(pricingRules.id, id)).returning();
      await writeAudit(tx, { actor, action: "pricing_rule.updated", entityType: "pricing_rule", entityId: id, before, after: r });
      return r;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

/** Existing reservations keep their price snapshot, so deleting a rule never changes them. */
export async function deletePricingRule(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const [r] = await tx.delete(pricingRules).where(eq(pricingRules.id, id)).returning();
    if (!r) throw new DomainError("NOT_FOUND", "Pricing rule not found");
    await writeAudit(tx, { actor, action: "pricing_rule.deleted", entityType: "pricing_rule", entityId: id, before: r });
  });
}

export async function adminListExtras(actor: Actor): Promise<Extra[]> {
  assertAdmin(actor);
  return db.select().from(extras).orderBy(asc(extras.sortOrder), asc(extras.name));
}

function extraValues(d: ReturnType<typeof extraSchema.parse>) {
  return {
    code: d.code,
    name: d.name,
    description: d.description ?? null,
    chargeType: d.chargeType,
    priceFils: d.priceFils,
    maxChargeFils: d.maxChargeFils ?? null,
    maxQuantity: d.maxQuantity,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  };
}

export async function createExtra(actor: Actor, input: ExtraInput): Promise<Extra> {
  assertAdmin(actor);
  const d = parseInput(extraSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [e] = await tx.insert(extras).values(extraValues(d)).returning();
      await writeAudit(tx, { actor, action: "extra.created", entityType: "extra", entityId: e.id, after: e });
      return e;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

export async function updateExtra(actor: Actor, id: string, input: ExtraInput): Promise<Extra> {
  assertAdmin(actor);
  const d = parseInput(extraSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(extras).where(eq(extras.id, id)).for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Extra not found");
      const [e] = await tx.update(extras).set(extraValues(d)).where(eq(extras.id, id)).returning();
      await writeAudit(tx, { actor, action: "extra.updated", entityType: "extra", entityId: id, before, after: e });
      return e;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}
