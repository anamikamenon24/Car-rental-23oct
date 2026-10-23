// Seed data for local development, e2e tests and demos. Idempotent: re-running upserts by natural
// keys (codes, VIN, email) and deterministic ids, so it is safe after a truncate or on top of an
// existing database. `reset: true` wipes all app data first.
import { createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { addDaysToDate, localDate, zonedTimeToUtc } from "@/lib/time";
import { calculateQuote, oneWayFee, returnCharges, selectPricingRule, type PricingRuleLike } from "@/server/pricing";
import * as s from "./schema";
import {
  SEED_AIRPORT_PREMIUM,
  SEED_BRANCHES,
  SEED_CATEGORIES,
  SEED_EXTRAS,
  SEED_FEATURES,
  SEED_RATES,
  SEED_VEHICLES,
  SEED_WINTER_PEAK,
} from "./seed-data";
import { SEED_USERS } from "./seed-users";

type SeedDb = NodePgDatabase<typeof s>;

/** Deterministic UUID (v5-style layout) from a name, so seeded rows keep their ids across runs. */
export function seedId(name: string): string {
  const h = createHash("sha1").update(`driveeasy-seed:${name}`).digest("hex");
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const TZ = "Asia/Dubai";

export const APP_TABLES = [
  "audit_logs",
  "payment_webhook_events",
  "damage_reports",
  "rental_agreements",
  "deposits",
  "payments",
  "reservation_extras",
  "reservations",
  "maintenance_blocks",
  "pricing_rules",
  "extras",
  "vehicle_feature_map",
  "vehicle_features",
  "vehicles",
  "vehicle_categories",
  "branches",
  "driver_profiles",
  "sessions",
  "accounts",
  "verifications",
  "users",
];

export async function resetData(db: SeedDb) {
  await db.execute(sql.raw(`truncate table ${APP_TABLES.map((t) => `"${t}"`).join(", ")} restart identity cascade`));
}

export interface SeedResult {
  branches: number;
  categories: number;
  vehicles: number;
  extras: number;
  pricingRules: number;
  reservations: number;
  users: { admin: string; customer: string };
}

export async function seed(db: SeedDb, opts: { reset?: boolean; now?: Date } = {}): Promise<SeedResult> {
  if (opts.reset) await resetData(db);
  const now = opts.now ?? new Date();

  // ---- Branches, categories, features, extras -------------------------------------------------
  const branchIds: Record<string, string> = {};
  for (const b of SEED_BRANCHES) {
    const [row] = await db
      .insert(s.branches)
      .values({ id: seedId(`branch:${b.code}`), ...b, timeZone: TZ, openingHours: b.openingHours as Record<string, unknown>, isActive: true })
      .onConflictDoUpdate({
        target: s.branches.code,
        set: { name: b.name, city: b.city, address: b.address, phone: b.phone, email: b.email, latitude: b.latitude, longitude: b.longitude, isAirport: b.isAirport, openingHours: b.openingHours as Record<string, unknown>, timeZone: TZ },
      })
      .returning({ id: s.branches.id });
    branchIds[b.code] = row.id;
  }

  const categoryIds: Record<string, string> = {};
  for (const c of SEED_CATEGORIES) {
    const [row] = await db
      .insert(s.vehicleCategories)
      .values({ id: seedId(`category:${c.code}`), ...c })
      .onConflictDoUpdate({ target: s.vehicleCategories.code, set: { name: c.name, description: c.description, depositFils: c.depositFils, sortOrder: c.sortOrder } })
      .returning({ id: s.vehicleCategories.id });
    categoryIds[c.code] = row.id;
  }

  const featureIds: Record<string, string> = {};
  for (const f of SEED_FEATURES) {
    const [row] = await db
      .insert(s.vehicleFeatures)
      .values({ id: seedId(`feature:${f.code}`), ...f })
      .onConflictDoUpdate({ target: s.vehicleFeatures.code, set: { name: f.name, icon: f.icon } })
      .returning({ id: s.vehicleFeatures.id });
    featureIds[f.code] = row.id;
  }

  const extraIds: Record<string, string> = {};
  for (const e of SEED_EXTRAS) {
    const [row] = await db
      .insert(s.extras)
      .values({ id: seedId(`extra:${e.code}`), ...e, isActive: true })
      .onConflictDoUpdate({
        target: s.extras.code,
        set: { name: e.name, description: e.description, chargeType: e.chargeType, priceFils: e.priceFils, maxChargeFils: e.maxChargeFils, maxQuantity: e.maxQuantity, sortOrder: e.sortOrder },
      })
      .returning({ id: s.extras.id });
    extraIds[e.code] = row.id;
  }

  // ---- Pricing rules (deterministic ids) ------------------------------------------------------
  const rules: (PricingRuleLike & { name: string })[] = [];
  for (const c of SEED_CATEGORIES) {
    const r = SEED_RATES[c.code];
    const cat = categoryIds[c.code];
    rules.push(
      { id: seedId(`rule:standard:${c.code}`), name: `${c.name} – standard`, categoryId: cat, branchId: null, dailyRateFils: r.standard, minDays: 1, validFrom: null, validTo: null, priority: 0, isActive: true },
      { id: seedId(`rule:weekly:${c.code}`), name: `${c.name} – weekly (7+ days)`, categoryId: cat, branchId: null, dailyRateFils: r.weekly, minDays: 7, validFrom: null, validTo: null, priority: 0, isActive: true },
      { id: seedId(`rule:monthly:${c.code}`), name: `${c.name} – monthly (28+ days)`, categoryId: cat, branchId: null, dailyRateFils: r.monthly, minDays: 28, validFrom: null, validTo: null, priority: 0, isActive: true },
    );
    if (SEED_AIRPORT_PREMIUM[c.code]) {
      rules.push({ id: seedId(`rule:airport:${c.code}`), name: `${c.name} – Dubai Airport`, categoryId: cat, branchId: branchIds.DXB, dailyRateFils: SEED_AIRPORT_PREMIUM[c.code], minDays: 1, validFrom: null, validTo: null, priority: 0, isActive: true });
    }
    if (SEED_WINTER_PEAK.rates[c.code]) {
      rules.push({ id: seedId(`rule:winter:${c.code}`), name: `${c.name} – winter peak`, categoryId: cat, branchId: null, dailyRateFils: SEED_WINTER_PEAK.rates[c.code], minDays: 1, validFrom: SEED_WINTER_PEAK.validFrom, validTo: SEED_WINTER_PEAK.validTo, priority: SEED_WINTER_PEAK.priority, isActive: true });
    }
  }
  for (const r of rules) {
    await db
      .insert(s.pricingRules)
      .values(r)
      .onConflictDoUpdate({ target: s.pricingRules.id, set: { name: r.name, dailyRateFils: r.dailyRateFils, minDays: r.minDays, validFrom: r.validFrom, validTo: r.validTo, priority: r.priority, branchId: r.branchId, isActive: true } });
  }

  // ---- Vehicles -------------------------------------------------------------------------------
  const vehicleIds: Record<string, string> = {};
  for (const v of SEED_VEHICLES) {
    const values = {
      categoryId: categoryIds[v.category],
      make: v.make,
      model: v.model,
      year: v.year,
      plate: v.plate,
      vin: v.vin,
      color: v.color,
      transmission: v.transmission,
      fuelType: v.fuelType,
      seats: v.seats,
      doors: v.doors,
      luggage: v.luggage,
      imageUrl: `/vehicles/${v.slug}.svg`,
      description: v.description,
    };
    const [row] = await db
      .insert(s.vehicles)
      .values({ id: seedId(`vehicle:${v.slug}`), ...values, branchId: branchIds[v.branch], mileageKm: v.mileageKm, status: "AVAILABLE" })
      // Operational fields (status, branch, mileage) are left alone on re-seed.
      .onConflictDoUpdate({ target: s.vehicles.vin, set: values })
      .returning({ id: s.vehicles.id });
    vehicleIds[v.slug] = row.id;
    await db.delete(s.vehicleFeatureMap).where(sql`${s.vehicleFeatureMap.vehicleId} = ${row.id}`);
    await db.insert(s.vehicleFeatureMap).values(v.features.map((f) => ({ vehicleId: row.id, featureId: featureIds[f] })));
  }

  // ---- Users ----------------------------------------------------------------------------------
  const userIds: Record<"admin" | "customer", string> = { admin: "", customer: "" };
  for (const key of ["admin", "customer"] as const) {
    const u = SEED_USERS[key];
    const [row] = await db
      .insert(s.users)
      .values({ id: seedId(`user:${key}`), name: u.name, email: u.email, emailVerified: true, role: u.role, phone: key === "customer" ? "+971 50 123 4567" : null })
      .onConflictDoUpdate({ target: s.users.email, set: { name: u.name, role: u.role, emailVerified: true } })
      .returning({ id: s.users.id });
    userIds[key] = row.id;
    const password = await hashPassword(u.password);
    await db
      .insert(s.accounts)
      .values({ id: seedId(`account:${key}`), accountId: row.id, providerId: "credential", userId: row.id, password })
      .onConflictDoUpdate({ target: [s.accounts.providerId, s.accounts.accountId], set: { password } });
  }
  const today = localDate(now, TZ);
  await db
    .insert(s.driverProfiles)
    .values({
      userId: userIds.customer,
      fullName: "Layla Al Mansoori",
      phone: "+971 50 123 4567",
      dateOfBirth: "1990-04-12",
      nationality: "AE",
      licenceNumber: "DXB-1234567",
      licenceCountry: "AE",
      licenceIssuedOn: "2012-06-01",
      licenceExpiresOn: `${Number(today.slice(0, 4)) + 4}-06-01`,
    })
    .onConflictDoNothing({ target: s.driverProfiles.userId });

  // ---- Reservations ---------------------------------------------------------------------------
  const at = (days: number, time: string) => zonedTimeToUtc(`${addDaysToDate(today, days)}T${time}`, TZ);
  const categoryOf = (slug: string) => SEED_VEHICLES.find((v) => v.slug === slug)!.category;
  const branchCity = (code: string) => SEED_BRANCHES.find((b) => b.code === code)!.city;

  interface SeedBooking {
    key: string;
    reference: string;
    vehicle: string;
    from: string;
    to: string;
    pickup: Date;
    ret: Date;
    status: "CONFIRMED" | "PICKED_UP" | "RETURNED" | "REFUNDED";
    extras?: { code: string; quantity: number }[];
  }
  const bookings: SeedBooking[] = [
    { key: "R1", reference: "DE-SEED0001", vehicle: "toyota-corolla-hybrid-2024", from: "DXB", to: "DXB", pickup: at(3, "10:00"), ret: at(6, "10:00"), status: "CONFIRMED", extras: [{ code: "CHILD_SEAT", quantity: 1 }] },
    { key: "R2", reference: "DE-SEED0002", vehicle: "nissan-patrol-2024", from: "DXB", to: "AUH", pickup: at(10, "09:00"), ret: at(14, "09:00"), status: "CONFIRMED", extras: [{ code: "FULL_INSURANCE", quantity: 1 }, { code: "SALIK_TAG", quantity: 1 }] },
    { key: "R3", reference: "DE-SEED0003", vehicle: "honda-civic-2024", from: "DTD", to: "DTD", pickup: at(-1, "10:00"), ret: at(2, "10:00"), status: "PICKED_UP" },
    { key: "R4", reference: "DE-SEED0004", vehicle: "toyota-yaris-2024", from: "DTD", to: "DTD", pickup: at(-10, "12:00"), ret: at(-7, "12:00"), status: "RETURNED", extras: [{ code: "GPS", quantity: 1 }] },
    { key: "R5", reference: "DE-SEED0005", vehicle: "hyundai-tucson-2024", from: "MRN", to: "MRN", pickup: at(20, "10:00"), ret: at(23, "10:00"), status: "REFUNDED" },
  ];

  let reservationCount = 0;
  for (const b of bookings) {
    const id = seedId(`reservation:${b.key}`);
    const cat = SEED_CATEGORIES.find((c) => c.code === categoryOf(b.vehicle))!;
    const rule = selectPricingRule(rules, {
      categoryId: categoryIds[cat.code],
      branchId: branchIds[b.from],
      days: Math.max(1, Math.ceil((b.ret.getTime() - b.pickup.getTime() - 59 * 60_000) / 86_400_000)),
      pickupAt: b.pickup,
      timeZone: TZ,
    })!;
    const quote = calculateQuote({
      pickupAt: b.pickup,
      returnAt: b.ret,
      dailyRateFils: rule.dailyRateFils,
      pricingRuleId: rule.id,
      extras: (b.extras ?? []).map((x) => {
        const e = SEED_EXTRAS.find((y) => y.code === x.code)!;
        return { extra: { ...e, id: extraIds[e.code], maxChargeFils: e.maxChargeFils ?? null }, quantity: x.quantity };
      }),
      oneWayFeeFils: oneWayFee({ id: b.from, city: branchCity(b.from) }, { id: b.to, city: branchCity(b.to) }),
      depositFils: cat.depositFils,
    });
    const confirmedAt = new Date(Math.min(now.getTime(), b.pickup.getTime()) - 7 * 86_400_000);
    try {
      const inserted = await db.transaction(async (tx) => {
        const res = await tx
          .insert(s.reservations)
          .values({
            id,
            reference: b.reference,
            userId: userIds.customer,
            vehicleId: vehicleIds[b.vehicle],
            pickupBranchId: branchIds[b.from],
            returnBranchId: branchIds[b.to],
            pickupAt: b.pickup,
            returnAt: b.ret,
            status: b.status,
            holdExpiresAt: null,
            idempotencyKey: `seed:${b.key}`,
            rentalDays: quote.days,
            dailyRateFils: quote.dailyRateFils,
            baseFils: quote.rentalFils,
            extrasFils: quote.extrasFils,
            oneWayFeeFils: quote.oneWayFeeFils,
            subtotalFils: quote.subtotalFils,
            vatFils: quote.vatFils,
            totalFils: quote.totalFils,
            depositFils: quote.depositFils,
            pricingRuleId: rule.id,
            priceBreakdown: quote,
            confirmedAt,
            pickedUpAt: b.status === "PICKED_UP" || b.status === "RETURNED" ? b.pickup : null,
            returnedAt: b.status === "RETURNED" ? b.ret : null,
            cancelledAt: b.status === "REFUNDED" ? new Date(confirmedAt.getTime() + 86_400_000) : null,
            cancellationReason: b.status === "REFUNDED" ? "Change of travel plans" : null,
            refundFils: b.status === "REFUNDED" ? quote.totalFils : 0,
          })
          .onConflictDoNothing({ target: s.reservations.id })
          .returning({ id: s.reservations.id });
        if (!res[0]) return false;
        if (quote.extras.length) {
          await tx.insert(s.reservationExtras).values(
            quote.extras.map((e) => ({ reservationId: id, extraId: e.extraId, name: e.name, chargeType: e.chargeType, quantity: e.quantity, unitPriceFils: e.unitFils, totalFils: e.totalFils })),
          );
        }
        // Ledger rows for money "already taken" (provider "seed": bookkeeping only, no real charge).
        await tx.insert(s.payments).values({
          id: seedId(`payment:${b.key}`),
          reservationId: id,
          kind: "RENTAL",
          attempt: 1,
          provider: "seed",
          providerPaymentId: `seed_pay_${b.key}`,
          idempotencyKey: `seed:${b.key}:payment`,
          amountFils: quote.totalFils,
          refundedFils: b.status === "REFUNDED" ? quote.totalFils : 0,
          status: b.status === "REFUNDED" ? "REFUNDED" : "SUCCEEDED",
        });
        const depositStatus = b.status === "CONFIRMED" || b.status === "PICKED_UP" ? "HELD" : "RELEASED";
        await tx.insert(s.deposits).values({
          id: seedId(`deposit:${b.key}`),
          reservationId: id,
          attempt: 1,
          provider: "seed",
          providerDepositId: `seed_dep_${b.key}`,
          idempotencyKey: `seed:${b.key}:deposit`,
          amountFils: quote.depositFils,
          status: depositStatus,
        });
        const vehicle = SEED_VEHICLES.find((v) => v.slug === b.vehicle)!;
        if (b.status === "PICKED_UP" || b.status === "RETURNED") {
          const charges = returnCharges({
            scheduledReturnAt: b.ret,
            actualReturnAt: b.ret,
            dailyRateFils: quote.dailyRateFils,
            pickupFuelEighths: 8,
            returnFuelEighths: 8,
            chargeFuel: true,
            damageChargeFils: 0,
            depositFils: quote.depositFils,
          });
          await tx.insert(s.rentalAgreements).values({
            id: seedId(`agreement:${b.key}`),
            reservationId: id,
            agreementNumber: `RA-SEED-${b.key}`,
            vehicleId: vehicleIds[b.vehicle],
            checkedOutAt: b.pickup,
            checkedOutBy: userIds.admin,
            pickupMileageKm: vehicle.mileageKm - (b.status === "RETURNED" ? 420 : 0),
            pickupFuelEighths: 8,
            ...(b.status === "RETURNED"
              ? {
                  checkedInAt: b.ret,
                  checkedInBy: userIds.admin,
                  returnBranchId: branchIds[b.to],
                  returnMileageKm: vehicle.mileageKm,
                  returnFuelEighths: 8,
                  lateFeeFils: charges.lateFeeFils,
                }
              : {}),
          });
          if (b.status === "PICKED_UP") {
            await tx.update(s.vehicles).set({ status: "ON_RENT" }).where(sql`${s.vehicles.id} = ${vehicleIds[b.vehicle]}`);
          }
        }
        await tx.insert(s.auditLogs).values({
          actorType: "SYSTEM",
          action: "reservation.seeded",
          entityType: "reservation",
          entityId: id,
          after: { status: b.status, reference: b.reference },
        });
        return true;
      });
      if (inserted) reservationCount++;
    } catch (err) {
      // e.g. the slot is now taken by a real booking in a long-lived dev DB: skip this sample.
      if ((err as { code?: string }).code !== "23P01" && (err as { cause?: { code?: string } }).cause?.code !== "23P01") throw err;
    }
  }

  // A future maintenance block and a past damage report.
  await db
    .insert(s.maintenanceBlocks)
    .values({ id: seedId("maintenance:pajero"), vehicleId: vehicleIds["mitsubishi-pajero-2023"], startsAt: at(5, "08:00"), endsAt: at(7, "18:00"), reason: "Scheduled 40,000 km service", createdBy: userIds.admin })
    .onConflictDoNothing()
    .catch(() => undefined);
  await db
    .insert(s.damageReports)
    .values({
      id: seedId("damage:R4"),
      vehicleId: vehicleIds["toyota-yaris-2024"],
      reservationId: seedId("reservation:R4"),
      reportedBy: userIds.admin,
      stage: "RETURN",
      severity: "MINOR",
      status: "REPAIRED",
      location: "Rear bumper, left",
      description: "Light scuff (5 cm), polished out. Pre-existing per pick-up photos; not charged.",
      estimatedCostFils: 15_000,
    })
    .onConflictDoNothing()
    .catch(() => undefined);

  return {
    branches: SEED_BRANCHES.length,
    categories: SEED_CATEGORIES.length,
    vehicles: SEED_VEHICLES.length,
    extras: SEED_EXTRAS.length,
    pricingRules: rules.length,
    reservations: reservationCount,
    users: { admin: SEED_USERS.admin.email, customer: SEED_USERS.customer.email },
  };
}
