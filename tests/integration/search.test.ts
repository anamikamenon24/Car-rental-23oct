// Q4 (service layer): branch selection, date ranges, filters, sorting and the availability calendar.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { makeVehicle } from "../helpers/factory";
import { closeTestPool, dubai, makeWorld, newKey, testPool, type World } from "../helpers/world";

const { searchVehicles, getVehicleAvailability, getVehicle, listBranches } = await import("@/server/catalog");
const { createReservationHold, payReservation } = await import("@/server/reservations");
const { isDomainError } = await import("@/server/errors");

let w: World;
let manualId: string;
let suvId: string;
let suvCategory: string;
let retiredId: string;

beforeAll(async () => {
  await truncateAll(loadTestEnv().testUrl);
  w = await makeWorld();
  const p = testPool();
  manualId = (await makeVehicle(p, w.branchA, w.categoryId)).id;
  await p.query("update vehicles set transmission = 'MANUAL', fuel_type = 'DIESEL', seats = 2 where id = $1", [manualId]);
  const { rows } = await p.query<{ id: string }>(
    "insert into vehicle_categories (code, slug, name, deposit_fils) values ($1, $2, 'SUV', 250000) returning id",
    [`SUV${randomUUID().slice(0, 4).toUpperCase()}`, `suv-${randomUUID().slice(0, 4)}`],
  );
  suvCategory = rows[0].id;
  await p.query("insert into pricing_rules (name, category_id, daily_rate_fils) values ('suv', $1, 40000)", [suvCategory]);
  suvId = (await makeVehicle(p, w.branchA, suvCategory)).id;
  await p.query("update vehicles set seats = 7 where id = $1", [suvId]);
  retiredId = (await makeVehicle(p, w.branchA, w.categoryId)).id;
  await p.query("update vehicles set status = 'RETIRED' where id = $1", [retiredId]);
});
afterAll(closeTestPool);

const search = (extra: Record<string, unknown> = {}, from = 20, to = 23) =>
  searchVehicles({ pickupBranchId: w.branchA, pickupAt: dubai(from), returnAt: dubai(to), ...extra } as never);
const ids = (r: Awaited<ReturnType<typeof search>>) => r.map((x) => x.vehicle.id);

describe("searchVehicles", () => {
  it("returns only cars based at the pick-up branch, excluding retired cars", async () => {
    const r = ids(await search());
    expect(r).toEqual(expect.arrayContaining([w.vehicleId, manualId, suvId]));
    expect(r).not.toContain(retiredId);
    expect(ids(await searchVehicles({ pickupBranchId: w.branchB, pickupAt: dubai(20), returnAt: dubai(23) } as never))).toEqual([]);
  });

  it("reports days, daily rate, deposit and a one-way fee only for a different return branch", async () => {
    const same = (await search()).find((x) => x.vehicle.id === suvId)!;
    expect(same).toMatchObject({ days: 3, dailyRateFils: 40000, rentalFils: 120000, oneWayFeeFils: 0, depositFils: 250000 });
    const oneWay = (await search({ returnBranchId: w.branchB })).find((x) => x.vehicle.id === suvId)!;
    expect(oneWay.oneWayFeeFils).toBeGreaterThan(0);
    expect(oneWay.estimatedTotalFils).toBeGreaterThan(same.estimatedTotalFils);
  });

  it("filters by category, transmission, fuel, seats and price", async () => {
    expect(ids(await search({ categoryId: suvCategory }))).toEqual([suvId]);
    expect(ids(await search({ transmission: "MANUAL" }))).toEqual([manualId]);
    expect(ids(await search({ fuelType: "DIESEL" }))).toEqual([manualId]);
    expect(ids(await search({ minSeats: 6 }))).toEqual([suvId]);
    expect(ids(await search({ maxDailyFils: 20000 }))).not.toContain(suvId);
    expect(ids(await search({ minDailyFils: 30000 }))).toEqual([suvId]);
  });

  it("sorts by price both ways", async () => {
    const asc = await search({ sort: "price_asc" });
    const desc = await search({ sort: "price_desc" });
    expect(asc.map((x) => x.dailyRateFils)).toEqual([...asc.map((x) => x.dailyRateFils)].sort((a, b) => a - b));
    expect(desc[0].vehicle.id).toBe(suvId);
  });

  it("hides a car booked for any overlapping part of the period, shows it for back-to-back dates", async () => {
    const h = await createReservationHold(w.customer, {
      vehicleId: suvId, pickupBranchId: w.branchA, returnBranchId: w.branchA,
      pickupAt: dubai(30), returnAt: dubai(33), idempotencyKey: newKey(),
    });
    await payReservation(w.customer, { reservationId: h.reservationId, paymentMethod: "pm_fake_success", idempotencyKey: newKey() });
    expect(ids(await search({}, 31, 32))).not.toContain(suvId);
    expect(ids(await search({}, 28, 31))).not.toContain(suvId);
    expect(ids(await search({}, 32, 35))).not.toContain(suvId);
    expect(ids(await search({}, 33, 35))).toContain(suvId); // starts exactly when the booking ends
    expect(ids(await search({}, 27, 30))).toContain(suvId); // ends exactly when the booking starts
  });

  it("hides a car under maintenance for the period", async () => {
    await testPool().query("insert into maintenance_blocks (vehicle_id, starts_at, ends_at, reason) values ($1, $2, $3, 'service')", [
      manualId, dubai(40), dubai(42),
    ]);
    expect(ids(await search({}, 41, 43))).not.toContain(manualId);
    expect(ids(await search({}, 42, 44))).toContain(manualId);
  });

  it("rejects invalid date ranges", async () => {
    for (const [from, to] of [[23, 20], [20, 20], [-3, 2]]) {
      await expect(search({}, from, to)).rejects.toSatisfy((e) => isDomainError(e, "VALIDATION"));
    }
  });
});

describe("catalog", () => {
  it("lists active branches with their time zone", async () => {
    const b = await listBranches();
    expect(b.map((x) => x.id)).toEqual(expect.arrayContaining([w.branchA, w.branchB]));
    expect(b.every((x) => x.timeZone === "Asia/Dubai")).toBe(true);
  });

  it("getVehicle returns detail, and null for an unknown id", async () => {
    await expect(getVehicle(suvId)).resolves.toMatchObject({ id: suvId, seats: 7 });
    await expect(getVehicle(randomUUID())).resolves.toBeNull();
  });
});

describe("availability calendar", () => {
  const ymd = (d: Date) => new Date(d.getTime() + 4 * 3600_000).toISOString().slice(0, 10); // Dubai local date

  it("marks booked, partial, maintenance and free days in branch-local dates", async () => {
    // booking 10:00 day 60 -> 10:00 day 62 (Dubai): day 60 partial or booked, day 61 booked, day 62 partial
    const h = await createReservationHold(w.customer, {
      vehicleId: w.vehicleId, pickupBranchId: w.branchA, returnBranchId: w.branchA,
      pickupAt: dubai(60), returnAt: dubai(62), idempotencyKey: newKey(),
    });
    await payReservation(w.customer, { reservationId: h.reservationId, paymentMethod: "pm_fake_success", idempotencyKey: newKey() });
    await testPool().query("insert into maintenance_blocks (vehicle_id, starts_at, ends_at, reason) values ($1, $2, $3, 'svc')", [
      w.vehicleId, dubai(65, 0), dubai(66, 0),
    ]);
    const cal = await getVehicleAvailability(w.vehicleId, ymd(dubai(58)), 10);
    expect(cal).toHaveLength(10);
    const at = (n: number) => cal.find((c) => c.date === ymd(dubai(n)))!.status;
    expect(at(58)).toBe("AVAILABLE");
    expect(at(59)).toBe("AVAILABLE");
    expect(["PARTIAL", "BOOKED"]).toContain(at(60));
    expect(at(61)).toBe("BOOKED");
    expect(at(62)).toBe("PARTIAL");
    expect(at(63)).toBe("AVAILABLE");
    expect(at(65)).toBe("MAINTENANCE");
    expect(at(66)).toBe("AVAILABLE");
  });

  it("validates the day range (1..62)", async () => {
    await expect(getVehicleAvailability(w.vehicleId, ymd(dubai(1)), 0)).rejects.toBeTruthy();
    await expect(getVehicleAvailability(w.vehicleId, ymd(dubai(1)), 63)).rejects.toBeTruthy();
  });
});
