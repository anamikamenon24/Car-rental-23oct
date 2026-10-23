// Q3 + Q10 (service layer): customers cannot reach other customers' reservations / vouchers,
// and every admin service refuses a CUSTOMER actor (FORBIDDEN) without writing anything.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { closeTestPool, dubai, makeWorld, newKey, testPool, type World } from "../helpers/world";

const { createReservationHold, payReservation, getMyReservation, getVoucher, listMyReservations, getCancellationQuote, quoteDateChange, modifyReservationDates } =
  await import("@/server/reservations");
const { isDomainError } = await import("@/server/errors");
const fleet = await import("@/server/admin/fleet");
const pricing = await import("@/server/admin/pricing");
const ops = await import("@/server/admin/operations");
const damage = await import("@/server/admin/damage");
const adminRes = await import("@/server/admin/reservations");
const branchesAdmin = await import("@/server/admin/branches");

let w: World;
let reservationId: string;

beforeAll(async () => {
  await truncateAll(loadTestEnv().testUrl);
  w = await makeWorld();
  const h = await createReservationHold(w.customer, {
    vehicleId: w.vehicleId, pickupBranchId: w.branchA, returnBranchId: w.branchA,
    pickupAt: dubai(10), returnAt: dubai(12), idempotencyKey: newKey(),
  });
  reservationId = h.reservationId;
  await payReservation(w.customer, { reservationId, paymentMethod: "pm_fake_success", idempotencyKey: newKey() });
});
afterAll(closeTestPool);

const deniedToOthers = (e: unknown) => isDomainError(e, "NOT_FOUND") || isDomainError(e, "FORBIDDEN");
const forbidden = (e: unknown) => isDomainError(e, "FORBIDDEN") || isDomainError(e, "NOT_FOUND");

describe("cross-customer access", () => {
  it("owner can read the reservation and voucher", async () => {
    await expect(getMyReservation(w.customer, reservationId)).resolves.toMatchObject({ id: reservationId });
    await expect(getVoucher(w.customer, reservationId)).resolves.toMatchObject({ reference: expect.any(String) });
  });

  it("another customer gets NOT_FOUND for reservation, voucher, cancellation and date-change quotes", async () => {
    await expect(getMyReservation(w.other, reservationId)).rejects.toSatisfy(deniedToOthers);
    await expect(getVoucher(w.other, reservationId)).rejects.toSatisfy(deniedToOthers);
    await expect(getCancellationQuote(w.other, reservationId)).rejects.toSatisfy(deniedToOthers);
    await expect(quoteDateChange(w.other, reservationId, { pickupAt: dubai(11), returnAt: dubai(13) })).rejects.toSatisfy(deniedToOthers);
    await expect(
      modifyReservationDates(w.other, reservationId, { pickupAt: dubai(11), returnAt: dubai(13), idempotencyKey: newKey() }),
    ).rejects.toSatisfy(deniedToOthers);
  });

  it("listMyReservations only returns the caller's own bookings", async () => {
    expect((await listMyReservations(w.customer)).map((r) => r.id)).toContain(reservationId);
    expect((await listMyReservations(w.other)).map((r) => r.id)).not.toContain(reservationId);
  });

  it("admin can read any reservation", async () => {
    await expect(getMyReservation(w.admin, reservationId)).resolves.toMatchObject({ id: reservationId });
    await expect(adminRes.adminGetReservation(w.admin, reservationId)).resolves.toBeTruthy();
  });
});

describe("admin services refuse customers", () => {
  const auditCount = async () => (await testPool().query<{ n: number }>("select count(*)::int as n from audit_logs")).rows[0].n;

  const cases: [string, () => Promise<unknown>][] = [
    ["fleet.adminListVehicles", () => fleet.adminListVehicles(w.customer, {})],
    ["fleet.createVehicle", () => fleet.createVehicle(w.customer, {} as never)],
    ["fleet.updateVehicle", () => fleet.updateVehicle(w.customer, w.vehicleId, {} as never)],
    ["fleet.setVehicleStatus", () => fleet.setVehicleStatus(w.customer, w.vehicleId, "MAINTENANCE" as never)],
    ["fleet.createMaintenanceBlock", () => fleet.createMaintenanceBlock(w.customer, { vehicleId: w.vehicleId, startsAt: dubai(50), endsAt: dubai(51), reason: "x" })],
    ["fleet.createCategory", () => fleet.createCategory(w.customer, {} as never)],
    ["pricing.listPricingRules", () => pricing.listPricingRules(w.customer)],
    ["pricing.createPricingRule", () => pricing.createPricingRule(w.customer, {} as never)],
    ["pricing.updateExtra", () => pricing.updateExtra(w.customer, w.extras.GPS, {} as never)],
    ["branches.createBranch", () => branchesAdmin.createBranch(w.customer, {} as never)],
    ["reservations.adminListReservations", () => adminRes.adminListReservations(w.customer, {})],
    ["reservations.adminGetReservation", () => adminRes.adminGetReservation(w.customer, reservationId)],
    ["reservations.adminCancelReservation", () => adminRes.adminCancelReservation(w.customer, reservationId, { reason: "x" })],
    ["operations.checkOut", () => ops.checkOut(w.customer, reservationId, { mileageKm: 100, fuelEighths: 8 })],
    ["operations.quoteCheckIn", () => ops.quoteCheckIn(w.customer, reservationId, { mileageKm: 200, fuelEighths: 8 })],
    ["operations.checkIn", () => ops.checkIn(w.customer, reservationId, { mileageKm: 200, fuelEighths: 8 })],
    ["damage.listDamageReports", () => damage.listDamageReports(w.customer, {})],
    ["damage.createDamageReport", () => damage.createDamageReport(w.customer, { vehicleId: w.vehicleId, severity: "MINOR", location: "x", description: "x" } as never)],
  ];

  for (const [name, call] of cases) {
    it(`${name} → FORBIDDEN for a customer`, async () => {
      const before = await auditCount();
      await expect(call()).rejects.toSatisfy(forbidden);
      expect(await auditCount()).toBe(before);
    });
  }

  it("the reservation is untouched after all the refused calls", async () => {
    const { rows } = await testPool().query("select status from reservations where id = $1", [reservationId]);
    expect(rows[0].status).toBe("CONFIRMED");
  });
});
