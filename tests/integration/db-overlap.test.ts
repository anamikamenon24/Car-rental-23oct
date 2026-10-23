// Q5 (database layer): the EXCLUDE constraint + guard trigger stop overlapping occupancy even when
// two transactions on separate connections race; back-to-back periods are allowed.
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { at, insertReservation, makeUser, makeVehicle } from "../helpers/factory";

const { testUrl } = loadTestEnv();
const pool = new Pool({ connectionString: testUrl, max: 10 });

let userId: string;
let vehicleId: string;
let branchId: string;

beforeAll(async () => {
  await truncateAll(testUrl);
});
afterAll(async () => {
  await pool.end();
});
beforeEach(async () => {
  userId = (await makeUser(pool)).id;
  const v = await makeVehicle(pool);
  vehicleId = v.id;
  branchId = v.branchId;
});

const isExclusion = (e: unknown) => (e as { code?: string }).code === "23P01";

describe("reservation overlap constraints", () => {
  it("rejects an overlapping active reservation", async () => {
    await insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-01-01T08:00Z"), returnAt: at("2027-01-04T08:00Z") });
    await expect(
      insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-01-03T08:00Z"), returnAt: at("2027-01-05T08:00Z") }),
    ).rejects.toSatisfy(isExclusion);
  });

  it("allows back-to-back reservations (end == next start)", async () => {
    await insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-02-01T08:00Z"), returnAt: at("2027-02-03T08:00Z") });
    await expect(
      insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-02-03T08:00Z"), returnAt: at("2027-02-05T08:00Z") }),
    ).resolves.toBeTypeOf("string");
  });

  it("ignores cancelled / expired reservations", async () => {
    for (const status of ["CANCELLED", "EXPIRED", "RETURNED"]) {
      await insertReservation(pool, { userId, vehicleId, branchId, status, pickupAt: at("2027-03-01T08:00Z"), returnAt: at("2027-03-04T08:00Z") });
    }
    await expect(
      insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-03-01T08:00Z"), returnAt: at("2027-03-04T08:00Z") }),
    ).resolves.toBeTypeOf("string");
  });

  it("blocks reservations overlapping maintenance, and maintenance overlapping reservations", async () => {
    await pool.query(`insert into maintenance_blocks (vehicle_id, starts_at, ends_at, reason) values ($1, $2, $3, 'service')`, [
      vehicleId, at("2027-04-10T00:00Z"), at("2027-04-12T00:00Z"),
    ]);
    await expect(
      insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-04-11T08:00Z"), returnAt: at("2027-04-13T08:00Z") }),
    ).rejects.toSatisfy(isExclusion);
    // back-to-back with maintenance is fine
    await insertReservation(pool, { userId, vehicleId, branchId, pickupAt: at("2027-04-12T00:00Z"), returnAt: at("2027-04-13T00:00Z") });
    await expect(
      pool.query(`insert into maintenance_blocks (vehicle_id, starts_at, ends_at, reason) values ($1, $2, $3, 'x')`, [
        vehicleId, at("2027-04-12T12:00Z"), at("2027-04-14T00:00Z"),
      ]),
    ).rejects.toSatisfy(isExclusion);
  });

  it("concurrent overlapping inserts on two connections: exactly one wins (50 rounds)", async () => {
    for (let i = 0; i < 50; i++) {
      const start = new Date(Date.UTC(2028, 0, 1) + i * 10 * 86400_000);
      const a = new Date(start.getTime() + 86400_000);
      const results = await Promise.allSettled(
        [0, 1].map(async (k) => {
          const c = await pool.connect();
          try {
            await c.query("begin");
            const id = await insertReservation(c, {
              userId, vehicleId, branchId,
              pickupAt: k === 0 ? start : a,
              returnAt: new Date((k === 0 ? start : a).getTime() + 3 * 86400_000),
            });
            await c.query("commit");
            return id;
          } catch (e) {
            await c.query("rollback");
            throw e;
          } finally {
            c.release();
          }
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled");
      const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(ok, `round ${i}`).toHaveLength(1);
      expect(bad.every((r) => isExclusion(r.reason)), `round ${i}`).toBe(true);
    }
  });

  it("concurrent reservation vs maintenance block: exactly one wins (30 rounds)", async () => {
    for (let i = 0; i < 30; i++) {
      const start = new Date(Date.UTC(2029, 0, 1) + i * 10 * 86400_000);
      const end = new Date(start.getTime() + 2 * 86400_000);
      const run = async (fn: (c: import("pg").PoolClient) => Promise<unknown>) => {
        const c = await pool.connect();
        try {
          await c.query("begin");
          await fn(c);
          await c.query("commit");
        } catch (e) {
          await c.query("rollback");
          throw e;
        } finally {
          c.release();
        }
      };
      const results = await Promise.allSettled([
        run((c) => insertReservation(c, { userId, vehicleId, branchId, pickupAt: start, returnAt: end })),
        run((c) => c.query(`insert into maintenance_blocks (vehicle_id, starts_at, ends_at, reason) values ($1,$2,$3,'race')`, [vehicleId, start, end])),
      ]);
      expect(results.filter((r) => r.status === "fulfilled"), `round ${i}`).toHaveLength(1);
    }
  });
});
