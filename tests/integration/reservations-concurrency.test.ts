// Q5 (service layer): two customers racing for the same car on separate DB connections.
// createReservationHold must let exactly one through; back-to-back periods must both succeed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { closeTestPool, dubai, makeActor, makeWorld, newKey, testPool, type World } from "../helpers/world";

const { createReservationHold } = await import("@/server/reservations");
const { isDomainError } = await import("@/server/errors");

let w: World;

beforeAll(async () => {
  await truncateAll(loadTestEnv().testUrl);
  w = await makeWorld();
});
afterAll(closeTestPool);

const hold = (actor: World["customer"], pickupAt: Date, returnAt: Date, idempotencyKey = newKey()) =>
  createReservationHold(actor, {
    vehicleId: w.vehicleId,
    pickupBranchId: w.branchA,
    returnBranchId: w.branchA,
    pickupAt,
    returnAt,
    idempotencyKey,
  });

describe("createReservationHold concurrency", () => {
  it("two simultaneous overlapping holds: exactly one succeeds, the other is VEHICLE_UNAVAILABLE (40 rounds)", async () => {
    for (let i = 0; i < 40; i++) {
      const base = 30 + i * 6;
      const results = await Promise.allSettled([
        hold(w.customer, dubai(base), dubai(base + 3)),
        hold(w.other, dubai(base + 1), dubai(base + 4)),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(ok, `round ${i}: ${failed.map((f) => String(f.reason)).join("; ")}`).toHaveLength(1);
      expect(isDomainError(failed[0].reason, "VEHICLE_UNAVAILABLE"), `round ${i}: ${failed[0].reason}`).toBe(true);
    }
    const { rows } = await testPool().query<{ n: number }>(
      "select count(*)::int as n from reservations where vehicle_id = $1 and status = 'PENDING'",
      [w.vehicleId],
    );
    expect(rows[0].n).toBe(40);
  });

  it("eight-way race for identical dates: exactly one hold", async () => {
    const racers = await Promise.all(Array.from({ length: 8 }, () => makeActor()));
    for (let i = 0; i < 10; i++) {
      const base = 400 + i * 5;
      const results = await Promise.allSettled(racers.map((a) => hold(a, dubai(base), dubai(base + 2))));
      expect(results.filter((r) => r.status === "fulfilled"), `round ${i}`).toHaveLength(1);
    }
  });

  it("back-to-back rentals (return == next pick-up) both succeed, also when raced", async () => {
    for (let i = 0; i < 20; i++) {
      const base = 500 + i * 6;
      const results = await Promise.allSettled([
        hold(w.customer, dubai(base), dubai(base + 2)),
        hold(w.other, dubai(base + 2), dubai(base + 4)),
      ]);
      expect(results.map((r) => r.status), `round ${i}`).toEqual(["fulfilled", "fulfilled"]);
    }
  });

  it("same idempotency key twice concurrently returns the same reservation, not a conflict", async () => {
    const key = newKey();
    const [a, b] = await Promise.all([hold(w.customer, dubai(700), dubai(702), key), hold(w.customer, dubai(700), dubai(702), key)]);
    expect(a.reservationId).toBe(b.reservationId);
  });

  it("rejects a hold without a driver profile and an invalid date range", async () => {
    const noDriver = await makeActor("CUSTOMER", { withDriver: false });
    await expect(hold(noDriver, dubai(720), dubai(722))).rejects.toSatisfy((e) => isDomainError(e, "DRIVER_PROFILE_REQUIRED"));
    await expect(hold(w.customer, dubai(732), dubai(730))).rejects.toSatisfy((e) => isDomainError(e, "VALIDATION"));
    await expect(hold(w.customer, dubai(-2), dubai(1))).rejects.toSatisfy((e) => isDomainError(e, "VALIDATION"));
  });
});
