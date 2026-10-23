import "server-only";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  branches,
  extras,
  maintenanceBlocks,
  pricingRules,
  reservations,
  vehicleCategories,
  vehicleFeatureMap,
  vehicleFeatures,
  vehicles,
  type Branch,
  type VehicleCategory,
} from "@/db/schema";
import { addDaysToDate, zonedTimeToUtc } from "@/lib/time";
import { db, type DbOrTx } from "./db";
import { DomainError, parseInput } from "./errors";
import { calculateQuote, oneWayFee, rentalDays, selectPricingRule } from "./pricing";
import { searchSchema, type SearchInput } from "./validation";

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export type OpeningHours = { "24h": true } | Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", [string, string]>>;

export interface BranchDto {
  id: string;
  code: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  email: string | null;
  timeZone: string;
  openingHours: OpeningHours;
  openingHoursText: string;
  latitude: number | null;
  longitude: number | null;
  isAirport: boolean;
  isActive: boolean;
  imageUrl: string | null;
}

export interface CategoryDto {
  id: string;
  code: string;
  slug: string;
  name: string;
  description: string | null;
  depositFils: number;
  fromDailyRateFils: number | null;
}

export interface ExtraDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  chargeType: "PER_DAY" | "PER_RENTAL";
  priceFils: number;
  maxChargeFils: number | null;
  maxQuantity: number;
}

export interface FeatureDto {
  id: string;
  code: string;
  name: string;
  icon: string | null;
}

export interface VehicleSummary {
  id: string;
  make: string;
  model: string;
  year: number;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  transmission: "AUTOMATIC" | "MANUAL";
  fuelType: "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC";
  seats: number;
  doors: number;
  luggage: number;
  color: string;
  imageUrl: string | null;
  photoUrls: string[];
  features: { code: string; name: string; icon: string | null }[];
  branchId: string;
  status: "AVAILABLE" | "RESERVED" | "ON_RENT" | "MAINTENANCE" | "RETIRED";
}

export interface VehicleDetail extends VehicleSummary {
  description: string | null;
  mileageKm: number;
  branch: BranchDto;
  category: CategoryDto;
  fromDailyRateFils: number | null;
}

export interface SearchResult {
  vehicle: VehicleSummary;
  dailyRateFils: number;
  days: number;
  rentalFils: number;
  oneWayFeeFils: number;
  estimatedTotalFils: number;
  depositFils: number;
}

export type AvailabilityStatus = "AVAILABLE" | "BOOKED" | "MAINTENANCE" | "PARTIAL";

// ---------------------------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------------------------

const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export function openingHoursText(h: OpeningHours): string {
  if ("24h" in h && h["24h"]) return "Open 24 hours";
  const entries = Object.entries(h as Record<string, [string, string]>);
  if (!entries.length) return "Hours not available";
  // Group consecutive identical days.
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const parts: string[] = [];
  let start: string | null = null;
  let prev: string | null = null;
  let prevVal = "";
  const flush = () => {
    if (start && prev) parts.push(`${DAY_LABELS[start]}${start !== prev ? `–${DAY_LABELS[prev]}` : ""} ${prevVal}`);
  };
  for (const d of order) {
    const v = (h as Record<string, [string, string]>)[d];
    const val = v ? `${v[0]}–${v[1]}` : "Closed";
    if (start && val === prevVal) {
      prev = d;
      continue;
    }
    flush();
    start = d;
    prev = d;
    prevVal = val;
  }
  flush();
  return parts.join(", ");
}

export function toBranchDto(b: Branch): BranchDto {
  const hours = (b.openingHours ?? {}) as OpeningHours;
  return {
    id: b.id,
    code: b.code,
    slug: b.slug,
    name: b.name,
    city: b.city,
    address: b.address,
    phone: b.phone,
    email: b.email,
    timeZone: b.timeZone,
    openingHours: hours,
    openingHoursText: openingHoursText(hours),
    latitude: b.latitude ?? null,
    longitude: b.longitude ?? null,
    isAirport: b.isAirport,
    isActive: b.isActive,
    imageUrl: b.imageUrl,
  };
}

function toCategoryDto(c: VehicleCategory, fromDailyRateFils: number | null): CategoryDto {
  return {
    id: c.id,
    code: c.code,
    slug: c.slug,
    name: c.name,
    description: c.description,
    depositFils: c.depositFils,
    fromDailyRateFils,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export async function listBranches(): Promise<BranchDto[]> {
  const rows = await db.select().from(branches).where(eq(branches.isActive, true)).orderBy(asc(branches.city), asc(branches.name));
  return rows.map(toBranchDto);
}

export async function getBranch(idOrCodeOrSlug: string): Promise<BranchDto | null> {
  const key = idOrCodeOrSlug.trim();
  const cond = UUID_RE.test(key)
    ? eq(branches.id, key)
    : or(eq(branches.code, key.toUpperCase()), eq(branches.slug, key.toLowerCase()));
  const [row] = await db.select().from(branches).where(cond).limit(1);
  return row ? toBranchDto(row) : null;
}

/** Lowest standard (minDays 1, undated or currently valid) all-branch rate per category. */
async function fromRates(tx: DbOrTx): Promise<Map<string, number>> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await tx
    .select({ categoryId: pricingRules.categoryId, rate: sql<number>`min(${pricingRules.dailyRateFils})::int` })
    .from(pricingRules)
    .where(
      and(
        eq(pricingRules.isActive, true),
        sql`(${pricingRules.validTo} is null or ${pricingRules.validTo} >= ${today})`,
        sql`(${pricingRules.validFrom} is null or ${pricingRules.validFrom} <= ${today})`,
      ),
    )
    .groupBy(pricingRules.categoryId);
  return new Map(rows.map((r) => [r.categoryId, Number(r.rate)]));
}

export async function listCategories(): Promise<CategoryDto[]> {
  const [rows, rates] = await Promise.all([
    db.select().from(vehicleCategories).orderBy(asc(vehicleCategories.sortOrder), asc(vehicleCategories.name)),
    fromRates(db),
  ]);
  return rows.map((c) => toCategoryDto(c, rates.get(c.id) ?? null));
}

export async function listExtras(): Promise<ExtraDto[]> {
  const rows = await db.select().from(extras).where(eq(extras.isActive, true)).orderBy(asc(extras.sortOrder), asc(extras.name));
  return rows.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    description: e.description,
    chargeType: e.chargeType,
    priceFils: e.priceFils,
    maxChargeFils: e.maxChargeFils,
    maxQuantity: e.maxQuantity,
  }));
}

export async function listFeatures(): Promise<FeatureDto[]> {
  return db
    .select({ id: vehicleFeatures.id, code: vehicleFeatures.code, name: vehicleFeatures.name, icon: vehicleFeatures.icon })
    .from(vehicleFeatures)
    .orderBy(asc(vehicleFeatures.name));
}

async function featuresFor(tx: DbOrTx, vehicleIds: string[]) {
  const map = new Map<string, { code: string; name: string; icon: string | null }[]>();
  if (!vehicleIds.length) return map;
  const rows = await tx
    .select({ vehicleId: vehicleFeatureMap.vehicleId, code: vehicleFeatures.code, name: vehicleFeatures.name, icon: vehicleFeatures.icon })
    .from(vehicleFeatureMap)
    .innerJoin(vehicleFeatures, eq(vehicleFeatures.id, vehicleFeatureMap.featureId))
    .where(inArray(vehicleFeatureMap.vehicleId, vehicleIds))
    .orderBy(asc(vehicleFeatures.name));
  for (const r of rows) {
    const list = map.get(r.vehicleId) ?? [];
    list.push({ code: r.code, name: r.name, icon: r.icon });
    map.set(r.vehicleId, list);
  }
  return map;
}

const vehicleColumns = {
  v: vehicles,
  c: vehicleCategories,
};

function toSummary(
  v: typeof vehicles.$inferSelect,
  c: typeof vehicleCategories.$inferSelect,
  features: { code: string; name: string; icon: string | null }[],
): VehicleSummary {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    categoryId: c.id,
    categoryName: c.name,
    categorySlug: c.slug,
    transmission: v.transmission,
    fuelType: v.fuelType,
    seats: v.seats,
    doors: v.doors,
    luggage: v.luggage,
    color: v.color,
    imageUrl: v.imageUrl,
    photoUrls: v.imageUrl ? [v.imageUrl] : [],
    features,
    branchId: v.branchId,
    status: v.status,
  };
}

/** SQL fragment: vehicle `v` is free of active reservations and maintenance blocks for [from, to). */
export function vehicleFreeSql(vehicleIdCol: unknown, from: Date, to: Date) {
  return sql`not exists (
      select 1 from ${reservations} r
       where r.vehicle_id = ${vehicleIdCol}
         and r.status in ('PENDING','CONFIRMED','PICKED_UP')
         and (r.status <> 'PENDING' or r.hold_expires_at > now())
         and r.period && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)'))
    and not exists (
      select 1 from ${maintenanceBlocks} m
       where m.vehicle_id = ${vehicleIdCol}
         and m.period && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)'))`;
}

export async function searchVehicles(input: SearchInput): Promise<SearchResult[]> {
  const q = parseInput(searchSchema, input);
  if (q.pickupAt.getTime() < Date.now() - 5 * 60_000) {
    throw new DomainError("VALIDATION", "Pick-up time is in the past", { fieldErrors: { pickupAt: ["Pick-up time is in the past"] } });
  }
  const branchRows = await db
    .select()
    .from(branches)
    .where(inArray(branches.id, [q.pickupBranchId, q.returnBranchId ?? q.pickupBranchId]));
  const pickup = branchRows.find((b) => b.id === q.pickupBranchId);
  const ret = branchRows.find((b) => b.id === (q.returnBranchId ?? q.pickupBranchId));
  if (!pickup || !pickup.isActive) throw new DomainError("NOT_FOUND", "Pick-up branch not found");
  if (!ret || !ret.isActive) throw new DomainError("NOT_FOUND", "Return branch not found");

  const conds = [
    eq(vehicles.branchId, pickup.id),
    ne(vehicles.status, "RETIRED"),
    ne(vehicles.status, "MAINTENANCE"),
    vehicleFreeSql(vehicles.id, q.pickupAt, q.returnAt),
  ];
  if (q.categoryId) conds.push(eq(vehicles.categoryId, q.categoryId));
  if (q.transmission) conds.push(eq(vehicles.transmission, q.transmission));
  if (q.fuelType) conds.push(eq(vehicles.fuelType, q.fuelType));
  if (q.minSeats) conds.push(sql`${vehicles.seats} >= ${q.minSeats}`);
  if (q.featureCodes?.length) {
    conds.push(sql`(select count(distinct f.code) from ${vehicleFeatureMap} fm join ${vehicleFeatures} f on f.id = fm.feature_id
                    where fm.vehicle_id = ${vehicles.id} and f.code in ${q.featureCodes}) = ${new Set(q.featureCodes).size}`);
  }

  const rows = await db
    .select(vehicleColumns)
    .from(vehicles)
    .innerJoin(vehicleCategories, eq(vehicleCategories.id, vehicles.categoryId))
    .where(and(...conds));
  if (!rows.length) return [];

  const rules = await db
    .select()
    .from(pricingRules)
    .where(and(eq(pricingRules.isActive, true), inArray(pricingRules.categoryId, [...new Set(rows.map((r) => r.c.id))])));
  const features = await featuresFor(db, rows.map((r) => r.v.id));
  const days = rentalDays(q.pickupAt, q.returnAt);
  const oneWay = oneWayFee(pickup, ret);

  const results: SearchResult[] = [];
  for (const { v, c } of rows) {
    const rule = selectPricingRule(rules, {
      categoryId: c.id,
      branchId: pickup.id,
      days,
      pickupAt: q.pickupAt,
      timeZone: pickup.timeZone,
    });
    if (!rule) continue; // not bookable without a price
    const quote = calculateQuote({
      pickupAt: q.pickupAt,
      returnAt: q.returnAt,
      dailyRateFils: rule.dailyRateFils,
      oneWayFeeFils: oneWay,
      depositFils: c.depositFils,
    });
    if (q.minDailyFils !== undefined && rule.dailyRateFils < q.minDailyFils) continue;
    if (q.maxDailyFils !== undefined && rule.dailyRateFils > q.maxDailyFils) continue;
    results.push({
      vehicle: toSummary(v, c, features.get(v.id) ?? []),
      dailyRateFils: rule.dailyRateFils,
      days,
      rentalFils: quote.rentalFils,
      oneWayFeeFils: oneWay,
      estimatedTotalFils: quote.totalFils,
      depositFils: c.depositFils,
    });
  }

  const sort = q.sort ?? "price_asc";
  results.sort((a, b) => {
    switch (sort) {
      case "price_desc":
        return b.dailyRateFils - a.dailyRateFils || a.vehicle.make.localeCompare(b.vehicle.make);
      case "seats":
        return b.vehicle.seats - a.vehicle.seats || a.dailyRateFils - b.dailyRateFils;
      case "newest":
        return b.vehicle.year - a.vehicle.year || a.dailyRateFils - b.dailyRateFils;
      default:
        return a.dailyRateFils - b.dailyRateFils || a.vehicle.make.localeCompare(b.vehicle.make);
    }
  });
  return results;
}

export async function getVehicle(id: string): Promise<VehicleDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select({ v: vehicles, c: vehicleCategories, b: branches })
    .from(vehicles)
    .innerJoin(vehicleCategories, eq(vehicleCategories.id, vehicles.categoryId))
    .innerJoin(branches, eq(branches.id, vehicles.branchId))
    .where(eq(vehicles.id, id))
    .limit(1);
  if (!row || row.v.status === "RETIRED") return null;
  const [features, rates] = await Promise.all([featuresFor(db, [id]), fromRates(db)]);
  const from = rates.get(row.c.id) ?? null;
  return {
    ...toSummary(row.v, row.c, features.get(id) ?? []),
    description: row.v.description,
    mileageKm: row.v.mileageKm,
    branch: toBranchDto(row.b),
    category: toCategoryDto(row.c, from),
    fromDailyRateFils: from,
  };
}

/** Day-by-day availability in the vehicle's branch time zone. */
export async function getVehicleAvailability(
  vehicleId: string,
  fromDate: string,
  days: number,
): Promise<{ date: string; status: AvailabilityStatus }[]> {
  if (!UUID_RE.test(vehicleId)) throw new DomainError("NOT_FOUND", "Vehicle not found");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) throw new DomainError("VALIDATION", "fromDate must be YYYY-MM-DD");
  if (!Number.isInteger(days) || days < 1 || days > 62) throw new DomainError("VALIDATION", "days must be 1..62");
  const [row] = await db
    .select({ tz: branches.timeZone })
    .from(vehicles)
    .innerJoin(branches, eq(branches.id, vehicles.branchId))
    .where(eq(vehicles.id, vehicleId));
  if (!row) throw new DomainError("NOT_FOUND", "Vehicle not found");
  const tz = row.tz;
  const dayStarts = Array.from({ length: days + 1 }, (_, i) => zonedTimeToUtc(addDaysToDate(fromDate, i), tz));
  const windowFrom = dayStarts[0].toISOString();
  const windowTo = dayStarts[days].toISOString();

  const busy = await db.execute<{ kind: "R" | "M"; lo: Date; hi: Date }>(sql`
    select 'R' as kind, r.pickup_at as lo, r.return_at as hi from ${reservations} r
     where r.vehicle_id = ${vehicleId}
       and r.status in ('PENDING','CONFIRMED','PICKED_UP')
       and (r.status <> 'PENDING' or r.hold_expires_at > now())
       and r.period && tstzrange(${windowFrom}::timestamptz, ${windowTo}::timestamptz, '[)')
    union all
    select 'M', m.starts_at, m.ends_at from ${maintenanceBlocks} m
     where m.vehicle_id = ${vehicleId}
       and m.period && tstzrange(${windowFrom}::timestamptz, ${windowTo}::timestamptz, '[)')`);
  const intervals = busy.rows.map((r) => ({ kind: r.kind, lo: new Date(r.lo).getTime(), hi: new Date(r.hi).getTime() }));

  return Array.from({ length: days }, (_, i) => {
    const s = dayStarts[i].getTime();
    const e = dayStarts[i + 1].getTime();
    const overlapping = intervals.filter((x) => x.lo < e && x.hi > s);
    let status: AvailabilityStatus = "AVAILABLE";
    if (overlapping.length) {
      const full = overlapping.find((x) => x.lo <= s && x.hi >= e);
      status = full ? (full.kind === "M" ? "MAINTENANCE" : "BOOKED") : "PARTIAL";
    }
    return { date: addDaysToDate(fromDate, i), status };
  });
}
