// Q7 + Q9 (service layer): admin check-out / check-in, late-return, fuel and damage charges,
// deposit capture/release, vehicle state and audit log. Expected values are hand-worked from the spec:
//   late ≤ 59 min free; else fullDays*daily + min(ceil(remaining h) * hourly, daily), hourly = 25% of daily (half-up)
//   fuel = missing eighths * 3500; VAT 5% half-up on (late + fuel + damage);
//   capture = min(total, deposit), release = deposit - capture, balanceDue = total - capture.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { makeVehicle } from "../helpers/factory";
import { closeTestPool, dubai, makeWorld, newKey, testPool, type World } from "../helpers/world";

const { createReservationHold, payReservation, getMyReservation } = await import("@/server/reservations");
const { checkOut, quoteCheckIn, checkIn } = await import("@/server/admin/operations");
const { isDomainError } = await import("@/server/errors");

let w: World;
let next = 10;
const H = 3600_000;
const MIN = 60_000;

beforeAll(async () => {
  await truncateAll(loadTestEnv().testUrl);
  w = await makeWorld({ dailyRateFils: 15000, depositFils: 100000 }); // hourly late = 3750
});
afterAll(closeTestPool);

/** A paid reservation on its own car, moved to start 1h from now (check-out opens 24h before pick-up). */
async function confirmed(returnBranchId = w.branchA) {
  const start = (next += 4);
  const vehicleId = (await makeVehicle(testPool(), w.branchA, w.categoryId)).id;
  await testPool().query("update vehicles set mileage_km = 0 where id = $1", [vehicleId]);
  const h = await createReservationHold(w.customer, {
    vehicleId, pickupBranchId: w.branchA, returnBranchId,
    pickupAt: dubai(start), returnAt: dubai(start + 2), idempotencyKey: newKey(),
  });
  await payReservation(w.customer, { reservationId: h.reservationId, paymentMethod: "pm_fake_success", idempotencyKey: newKey() });
  const { rows } = await testPool().query<{ return_at: Date }>(
    `update reservations set pickup_at = now() + interval '1 hour', return_at = now() + interval '2 days 1 hour'
     where id = $1 returning return_at`,
    [h.reservationId],
  );
  return { id: h.reservationId, returnAt: rows[0].return_at, vehicleId };
}

describe("late-return charges (quoteCheckIn, exact fils)", () => {
  let r: Awaited<ReturnType<typeof confirmed>>;
  beforeAll(async () => {
    r = await confirmed();
    await checkOut(w.admin, r.id, { mileageKm: 1000, fuelEighths: 8 });
  });
  const lateBy = (ms: number, extra: Record<string, unknown> = {}) =>
    quoteCheckIn(w.admin, r.id, { returnedAt: new Date(r.returnAt.getTime() + ms), mileageKm: 1200, fuelEighths: 8, ...extra });

  it.each([
    ["on time", 0, 0, 0],
    ["early", -2 * H, 0, 0],
    ["59 min (grace)", 59 * MIN, 59, 0],
    ["60 min → 1h", 60 * MIN, 60, 3750],
    ["61 min → 2h", 61 * MIN, 61, 7500],
    ["4h → capped at a day", 4 * H, 240, 15000],
    ["5h → capped at a day", 5 * H, 300, 15000],
    ["1 day 2h", 26 * H, 1560, 22500],
    ["2 days exactly", 48 * H, 2880, 30000],
  ])("%s", async (_l, ms, lateMinutes, fee) => {
    const c = await lateBy(ms);
    expect(c.lateFeeFils).toBe(fee);
    if (ms > 0) expect(c.lateMinutes).toBe(lateMinutes);
    expect(c.vatFils).toBe(Math.floor((fee * 500 + 5000) / 10000));
  });

  it("late + fuel + damage, VAT half-up, deposit split", async () => {
    const c = await lateBy(60 * MIN, { fuelEighths: 5, damageChargeFils: 20000 });
    // 3750 + 3*3500 + 20000 = 34250; VAT 1712.5 → 1713; total 35963
    expect(c).toMatchObject({
      lateFeeFils: 3750, fuelChargeFils: 10500, damageChargeFils: 20000, vatFils: 1713, totalFils: 35963,
      depositFils: 100000, depositCaptureFils: 35963, depositReleaseFils: 64037, balanceDueFils: 0,
    });
  });

  it("charges above the deposit become a balance due", async () => {
    const c = await lateBy(0, { damageChargeFils: 120000 });
    expect(c).toMatchObject({ vatFils: 6000, totalFils: 126000, depositCaptureFils: 100000, depositReleaseFils: 0, balanceDueFils: 26000 });
  });

  it("chargeFuel=false waives fuel; more fuel than at pick-up is not credited", async () => {
    expect((await lateBy(0, { fuelEighths: 2, chargeFuel: false })).fuelChargeFils).toBe(0);
    const full = await lateBy(0, { fuelEighths: 8 });
    expect(full).toMatchObject({ fuelChargeFils: 0, totalFils: 0, depositCaptureFils: 0, depositReleaseFils: 100000 });
  });

  it("rejects return mileage below pick-up mileage and fuel outside 0..8", async () => {
    await expect(lateBy(0, { mileageKm: 999 })).rejects.toSatisfy((e) => isDomainError(e, "VALIDATION"));
    await expect(lateBy(0, { fuelEighths: 9 })).rejects.toSatisfy((e) => isDomainError(e, "VALIDATION"));
  });
});

describe("check-out → check-in lifecycle", () => {
  it("check-out: PICKED_UP, agreement with mileage + fuel, vehicle ON_RENT; cannot check out twice", async () => {
    const r = await confirmed();
    const agreement = await checkOut(w.admin, r.id, { mileageKm: 5000, fuelEighths: 7, notes: "scratch on bumper" });
    expect(agreement).toMatchObject({ pickupMileageKm: 5000, pickupFuelEighths: 7 });
    const p = testPool();
    expect((await p.query("select status from reservations where id = $1", [r.id])).rows[0].status).toBe("PICKED_UP");
    expect((await p.query("select status from vehicles where id = $1", [r.vehicleId])).rows[0].status).toBe("ON_RENT");
    await expect(checkOut(w.admin, r.id, { mileageKm: 5000, fuelEighths: 7 })).rejects.toSatisfy((e) => isDomainError(e, "INVALID_STATE"));

    // finish this rental so the car is free for the next tests
    await checkIn(w.admin, r.id, { mileageKm: 5100, fuelEighths: 7 });
  });

  it("cannot check out a PENDING (unpaid) reservation or check in one that was never checked out", async () => {
    const start = (next += 4);
    const h = await createReservationHold(w.customer, {
      vehicleId: w.vehicleId, pickupBranchId: w.branchA, returnBranchId: w.branchA,
      pickupAt: dubai(start), returnAt: dubai(start + 1), idempotencyKey: newKey(),
    });
    await testPool().query("update reservations set pickup_at = now() + interval '1 hour', return_at = now() + interval '25 hours' where id = $1", [h.reservationId]);
    await expect(checkOut(w.admin, h.reservationId, { mileageKm: 1, fuelEighths: 8 })).rejects.toSatisfy((e) => isDomainError(e, "INVALID_STATE"));
    const c = await confirmed();
    await expect(checkIn(w.admin, c.id, { mileageKm: 1, fuelEighths: 8 })).rejects.toSatisfy((e) => isDomainError(e, "INVALID_STATE"));
  });

  it("late check-in (one-way): RETURNED, fees stored, deposit partly captured, car AVAILABLE at the return branch, audit rows", async () => {
    const r = await confirmed(w.branchB);
    await checkOut(w.admin, r.id, { mileageKm: 8000, fuelEighths: 8 });
    const p = testPool();
    // Move the rental into the past so a real check-in now is 90 minutes late.
    await p.query(
      `update reservations set pickup_at = now() - interval '2 days', return_at = now() - interval '90 minutes' where id = $1`,
      [r.id],
    );
    await p.query("update rental_agreements set checked_out_at = now() - interval '2 days' where reservation_id = $1", [r.id]);
    const agreement = await checkIn(w.admin, r.id, { mileageKm: 8450, fuelEighths: 6, returnBranchId: w.branchB, damageChargeFils: 0 });
    // late 90 min → 2h * 3750 = 7500; fuel 2*3500 = 7000; subtotal 14500; VAT 725; total 15225
    expect(agreement).toMatchObject({
      returnMileageKm: 8450, returnFuelEighths: 6, lateFeeFils: 7500, fuelChargeFils: 7000,
      additionalVatFils: 725, additionalTotalFils: 15225, depositCapturedFils: 15225, balanceDueFils: 0,
    });
    const res = (await p.query("select status from reservations where id = $1", [r.id])).rows[0];
    expect(res.status).toBe("RETURNED");
    const v = (await p.query("select status, branch_id, mileage_km from vehicles where id = $1", [r.vehicleId])).rows[0];
    expect(v).toMatchObject({ status: "AVAILABLE", branch_id: w.branchB, mileage_km: 8450 });
    const dep = (await p.query("select status, captured_fils from deposits where reservation_id = $1 and status <> 'FAILED'", [r.id])).rows[0];
    expect(dep).toMatchObject({ status: "CAPTURED", captured_fils: 15225 });
    const audit = (await p.query("select action from audit_logs where entity_id = $1 or (metadata->>'reservationId') = $1::text", [r.id])).rows;
    expect(audit.length).toBeGreaterThanOrEqual(2);
    // customer sees the agreement on their reservation
    const detail = await getMyReservation(w.customer, r.id);
    expect(detail.agreement).toBeTruthy();
  });

  it("on-time check-in with no charges releases the whole deposit", async () => {
    const r = await confirmed();
    await checkOut(w.admin, r.id, { mileageKm: 9000, fuelEighths: 8 });
    await checkIn(w.admin, r.id, { mileageKm: 9100, fuelEighths: 8 }); // early return → no late fee
    const dep = (await testPool().query("select status, captured_fils from deposits where reservation_id = $1 and status <> 'FAILED'", [r.id])).rows[0];
    expect(dep).toMatchObject({ status: "RELEASED", captured_fils: 0 });
  });
});
