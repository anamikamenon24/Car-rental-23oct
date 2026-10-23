import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, type SQL } from "drizzle-orm";
import {
  branches,
  maintenanceBlocks,
  vehicleCategories,
  vehicleFeatureMap,
  vehicleFeatures,
  vehicles,
  type MaintenanceBlock,
  type Vehicle,
  type VehicleCategory,
} from "@/db/schema";
import { assertAdmin, type Actor } from "../auth";
import { db, writeAudit, type Tx } from "../db";
import { DomainError, parseInput, toDomainError, vehicleUnavailable } from "../errors";
import { settleAll } from "../payments";
import { expireStaleHoldsForVehicle, hasConflict } from "../reservations";
import {
  categorySchema,
  maintenanceBlockSchema,
  vehicleSchema,
  vehicleStatusValues,
  type CategoryInput,
  type MaintenanceBlockInput,
  type VehicleInput,
} from "../validation";

export interface AdminVehicleRow extends Vehicle {
  categoryName: string;
  branchName: string;
  branchTimeZone: string;
  featureCodes: string[];
}

export async function adminListVehicles(
  actor: Actor,
  filter: { q?: string; branchId?: string; categoryId?: string; status?: Vehicle["status"] } = {},
): Promise<AdminVehicleRow[]> {
  assertAdmin(actor);
  const conds: SQL[] = [];
  if (filter.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    conds.push(or(ilike(vehicles.make, q), ilike(vehicles.model, q), ilike(vehicles.plate, q), ilike(vehicles.vin, q))!);
  }
  if (filter.branchId) conds.push(eq(vehicles.branchId, filter.branchId));
  if (filter.categoryId) conds.push(eq(vehicles.categoryId, filter.categoryId));
  if (filter.status) conds.push(eq(vehicles.status, filter.status));
  const rows = await db
    .select({ v: vehicles, categoryName: vehicleCategories.name, branchName: branches.name, tz: branches.timeZone })
    .from(vehicles)
    .innerJoin(vehicleCategories, eq(vehicleCategories.id, vehicles.categoryId))
    .innerJoin(branches, eq(branches.id, vehicles.branchId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(branches.name), asc(vehicles.make), asc(vehicles.model));
  const features = await featureCodes(rows.map((r) => r.v.id));
  return rows.map((r) => ({
    ...r.v,
    categoryName: r.categoryName,
    branchName: r.branchName,
    branchTimeZone: r.tz,
    featureCodes: features.get(r.v.id) ?? [],
  }));
}

async function featureCodes(ids: string[]) {
  const map = new Map<string, string[]>();
  if (!ids.length) return map;
  const rows = await db
    .select({ vehicleId: vehicleFeatureMap.vehicleId, code: vehicleFeatures.code })
    .from(vehicleFeatureMap)
    .innerJoin(vehicleFeatures, eq(vehicleFeatures.id, vehicleFeatureMap.featureId))
    .where(inArray(vehicleFeatureMap.vehicleId, ids));
  for (const r of rows) map.set(r.vehicleId, [...(map.get(r.vehicleId) ?? []), r.code]);
  return map;
}

export async function adminGetVehicle(actor: Actor, id: string): Promise<AdminVehicleRow & { maintenance: MaintenanceBlock[] }> {
  assertAdmin(actor);
  const rows = await adminListVehicles(actor, {});
  const v = rows.find((r) => r.id === id);
  if (!v) throw new DomainError("NOT_FOUND", "Vehicle not found");
  const maintenance = await db
    .select()
    .from(maintenanceBlocks)
    .where(eq(maintenanceBlocks.vehicleId, id))
    .orderBy(desc(maintenanceBlocks.startsAt));
  return { ...v, maintenance };
}

async function setFeatures(tx: Tx, vehicleId: string, codes: string[]) {
  await tx.delete(vehicleFeatureMap).where(eq(vehicleFeatureMap.vehicleId, vehicleId));
  if (!codes.length) return;
  const found = await tx.select().from(vehicleFeatures).where(inArray(vehicleFeatures.code, codes));
  if (found.length !== new Set(codes).size) {
    throw new DomainError("VALIDATION", "Unknown feature", { fieldErrors: { featureCodes: ["Unknown feature code"] } });
  }
  await tx.insert(vehicleFeatureMap).values(found.map((f) => ({ vehicleId, featureId: f.id })));
}

function vehicleValues(d: ReturnType<typeof vehicleSchema.parse>) {
  return {
    categoryId: d.categoryId,
    branchId: d.branchId,
    make: d.make,
    model: d.model,
    year: d.year,
    plate: d.plate,
    vin: d.vin,
    color: d.color,
    transmission: d.transmission,
    fuelType: d.fuelType,
    seats: d.seats,
    doors: d.doors,
    luggage: d.luggage,
    mileageKm: d.mileageKm,
    status: d.status,
    imageUrl: d.imageUrl ?? null,
    description: d.description ?? null,
  };
}

function uniqueMessage(err: unknown) {
  const mapped = toDomainError(err);
  if (mapped instanceof DomainError && mapped.code === "CONFLICT") {
    const c = String(mapped.details?.constraint ?? "");
    if (c.includes("plate")) return new DomainError("CONFLICT", "Another vehicle has this plate", { fieldErrors: { plate: ["Already used"] } });
    if (c.includes("vin")) return new DomainError("CONFLICT", "Another vehicle has this VIN", { fieldErrors: { vin: ["Already used"] } });
  }
  return mapped;
}

export async function createVehicle(actor: Actor, input: VehicleInput): Promise<Vehicle> {
  assertAdmin(actor);
  const data = parseInput(vehicleSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [v] = await tx.insert(vehicles).values(vehicleValues(data)).returning();
      await setFeatures(tx, v.id, data.featureCodes);
      await writeAudit(tx, { actor, action: "vehicle.created", entityType: "vehicle", entityId: v.id, after: { ...v, featureCodes: data.featureCodes } });
      return v;
    });
  } catch (err) {
    throw uniqueMessage(err);
  }
}

export async function updateVehicle(actor: Actor, id: string, input: VehicleInput): Promise<Vehicle> {
  assertAdmin(actor);
  const data = parseInput(vehicleSchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Vehicle not found");
      const [v] = await tx.update(vehicles).set(vehicleValues(data)).where(eq(vehicles.id, id)).returning();
      await setFeatures(tx, id, data.featureCodes);
      await writeAudit(tx, { actor, action: "vehicle.updated", entityType: "vehicle", entityId: id, before, after: { ...v, featureCodes: data.featureCodes } });
      return v;
    });
  } catch (err) {
    throw uniqueMessage(err);
  }
}

export async function setVehicleStatus(actor: Actor, id: string, status: Vehicle["status"]): Promise<Vehicle> {
  assertAdmin(actor);
  if (!vehicleStatusValues.includes(status)) throw new DomainError("VALIDATION", "Unknown status");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(vehicles).where(eq(vehicles.id, id)).for("update");
    if (!before) throw new DomainError("NOT_FOUND", "Vehicle not found");
    if (before.status === "ON_RENT" && status !== "ON_RENT") {
      throw new DomainError("INVALID_STATE", "This vehicle is on rent; check it in first");
    }
    if (status === "ON_RENT" && before.status !== "ON_RENT") {
      throw new DomainError("INVALID_STATE", "Use check-out to put a vehicle on rent");
    }
    const [v] = await tx.update(vehicles).set({ status }).where(eq(vehicles.id, id)).returning();
    await writeAudit(tx, {
      actor,
      action: "vehicle.status_changed",
      entityType: "vehicle",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
    return v;
  });
}

// ---------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------

export async function listCategoriesAdmin(actor: Actor): Promise<VehicleCategory[]> {
  assertAdmin(actor);
  return db.select().from(vehicleCategories).orderBy(asc(vehicleCategories.sortOrder), asc(vehicleCategories.name));
}

export async function createCategory(actor: Actor, input: CategoryInput): Promise<VehicleCategory> {
  assertAdmin(actor);
  const d = parseInput(categorySchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(vehicleCategories)
        .values({ ...d, description: d.description ?? null })
        .returning();
      await writeAudit(tx, { actor, action: "category.created", entityType: "vehicle_category", entityId: c.id, after: c });
      return c;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

export async function updateCategory(actor: Actor, id: string, input: CategoryInput): Promise<VehicleCategory> {
  assertAdmin(actor);
  const d = parseInput(categorySchema, input);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(vehicleCategories).where(eq(vehicleCategories.id, id)).for("update");
      if (!before) throw new DomainError("NOT_FOUND", "Category not found");
      const [c] = await tx
        .update(vehicleCategories)
        .set({ ...d, description: d.description ?? null })
        .where(eq(vehicleCategories.id, id))
        .returning();
      await writeAudit(tx, { actor, action: "category.updated", entityType: "vehicle_category", entityId: id, before, after: c });
      return c;
    });
  } catch (err) {
    throw toDomainError(err);
  }
}

// ---------------------------------------------------------------------------------------------
// Maintenance blocks
// ---------------------------------------------------------------------------------------------

export async function listMaintenanceBlocks(actor: Actor, filter: { vehicleId?: string; from?: Date; to?: Date } = {}) {
  assertAdmin(actor);
  const conds: SQL[] = [];
  if (filter.vehicleId) conds.push(eq(maintenanceBlocks.vehicleId, filter.vehicleId));
  if (filter.from) conds.push(gte(maintenanceBlocks.endsAt, filter.from));
  if (filter.to) conds.push(lte(maintenanceBlocks.startsAt, filter.to));
  return db
    .select({ block: maintenanceBlocks, make: vehicles.make, model: vehicles.model, plate: vehicles.plate })
    .from(maintenanceBlocks)
    .innerJoin(vehicles, eq(vehicles.id, maintenanceBlocks.vehicleId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(maintenanceBlocks.startsAt));
}

/** Blocks the vehicle for [startsAt, endsAt). Same lock + stale-hold expiry as bookings. */
export async function createMaintenanceBlock(actor: Actor, input: MaintenanceBlockInput, opts: { now?: Date } = {}) {
  assertAdmin(actor);
  const d = parseInput(maintenanceBlockSchema, input);
  const now = opts.now ?? new Date();
  let stale: string[] = [];
  try {
    const block = await db.transaction(async (tx) => {
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, d.vehicleId)).for("update");
      if (!v) throw new DomainError("NOT_FOUND", "Vehicle not found");
      stale = await expireStaleHoldsForVehicle(tx, v.id, now);
      if (await hasConflict(tx, v.id, d.startsAt, d.endsAt)) throw vehicleUnavailable();
      const [b] = await tx
        .insert(maintenanceBlocks)
        .values({ vehicleId: v.id, startsAt: d.startsAt, endsAt: d.endsAt, reason: d.reason, createdBy: actor.id })
        .returning();
      await writeAudit(tx, { actor, action: "maintenance.created", entityType: "maintenance_block", entityId: b.id, after: b });
      return b;
    });
    if (stale.length) await settleAll(stale, now);
    return block;
  } catch (err) {
    const mapped = toDomainError(err);
    if (mapped instanceof DomainError && mapped.code === "VEHICLE_UNAVAILABLE") {
      throw new DomainError("VEHICLE_UNAVAILABLE", "The vehicle is booked or already blocked in that period", { cause: err });
    }
    throw mapped;
  }
}

export async function deleteMaintenanceBlock(actor: Actor, id: string): Promise<void> {
  assertAdmin(actor);
  await db.transaction(async (tx) => {
    const [b] = await tx.delete(maintenanceBlocks).where(eq(maintenanceBlocks.id, id)).returning();
    if (!b) throw new DomainError("NOT_FOUND", "Maintenance block not found");
    await writeAudit(tx, { actor, action: "maintenance.deleted", entityType: "maintenance_block", entityId: id, before: b });
  });
}
