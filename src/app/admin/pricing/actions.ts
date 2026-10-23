"use server";

import { adminMutation, aedToFils, opt, optFils, str } from "../_lib/form";
import {
  createExtra,
  createPricingRule,
  deletePricingRule,
  updateExtra,
  updatePricingRule,
} from "@/server/admin/pricing";
import type { ExtraInput, PricingRuleInput } from "@/server/validation";
import type { FormState } from "@/lib/ui/form-state";

function pricingRuleInput(fd: FormData): PricingRuleInput {
  return {
    name: str(fd, "name"),
    categoryId: str(fd, "categoryId"),
    branchId: opt(fd, "branchId"),
    dailyRateFils: aedToFils(str(fd, "dailyRateFils")),
    minDays: str(fd, "minDays") ? Number(str(fd, "minDays")) : 1,
    validFrom: opt(fd, "validFrom"),
    validTo: opt(fd, "validTo"),
    priority: str(fd, "priority") ? Number(str(fd, "priority")) : 0,
    isActive: fd.get("isActive") === "true" || fd.get("isActive") === "on",
  } as PricingRuleInput;
}

export async function createPricingRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => createPricingRule(actor, pricingRuleInput(fd)), {
    success: (r) => `Pricing rule "${r.name}" created.`,
  });
}

export async function updatePricingRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => updatePricingRule(actor, str(fd, "id"), pricingRuleInput(fd)), {
    success: "Pricing rule updated.",
    keepValues: true,
  });
}

export async function deletePricingRuleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => deletePricingRule(actor, str(fd, "id")), {
    success: "Pricing rule removed.",
  });
}

function extraInput(fd: FormData): ExtraInput {
  return {
    code: str(fd, "code"),
    name: str(fd, "name"),
    description: opt(fd, "description"),
    chargeType: str(fd, "chargeType") as "PER_DAY" | "PER_RENTAL",
    priceFils: aedToFils(str(fd, "priceFils")),
    maxChargeFils: optFils(fd, "maxChargeFils"),
    maxQuantity: str(fd, "maxQuantity") ? Number(str(fd, "maxQuantity")) : 1,
    isActive: fd.get("isActive") === "true" || fd.get("isActive") === "on",
    sortOrder: str(fd, "sortOrder") ? Number(str(fd, "sortOrder")) : 0,
  } as ExtraInput;
}

export async function createExtraAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => createExtra(actor, extraInput(fd)), {
    success: (e) => `Extra "${e.name}" created.`,
  });
}

export async function updateExtraAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(fd, (actor) => updateExtra(actor, str(fd, "id"), extraInput(fd)), {
    success: "Extra saved.",
    keepValues: true,
  });
}
