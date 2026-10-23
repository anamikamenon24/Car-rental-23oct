// Q7: exact fils values for quotes. Expected numbers are worked by hand from the pricing spec
// (TASKS.md / db's rules), not from the implementation:
//   days = max(1, ceil((duration - 59min) / 24h)); subtotal = rate*days + extras + one-way;
//   VAT = 5% half-up on subtotal; total = subtotal + VAT; deposit = category deposit (not in total).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { makeBranch, makeCategory, makeVehicle } from "../helpers/factory";
import { closeTestPool, dubai, makeWorld, testPool, type World } from "../helpers/world";

const { quoteRental } = await import("@/server/quotes");
const { isDomainError } = await import("@/server/errors");

let w: World;
const H = 3600_000;
const MIN = 60_000;

beforeAll(async () => {
  await truncateAll(loadTestEnv().testUrl);
  w = await makeWorld({ dailyRateFils: 15000, depositFils: 100000 });
});
afterAll(closeTestPool);

const q = (o: { pickupAt: Date; returnAt: Date; returnBranchId?: string; extras?: { extraId: string; quantity: number }[]; vehicleId?: string; pickupBranchId?: string }) =>
  quoteRental({
    vehicleId: o.vehicleId ?? w.vehicleId,
    pickupBranchId: o.pickupBranchId ?? w.branchA,
    returnBranchId: o.returnBranchId ?? o.pickupBranchId ?? w.branchA,
    pickupAt: o.pickupAt,
    returnAt: o.returnAt,
    extras: o.extras ?? [],
  });

describe("rental days", () => {
  const start = dubai(30);
  const days = async (ms: number) => (await q({ pickupAt: start, returnAt: new Date(start.getTime() + ms) })).days;
  it.each([
    ["2h", 2 * H, 1],
    ["24h", 24 * H, 1],
    ["24h59m (grace)", 24 * H + 59 * MIN, 1],
    ["25h", 25 * H, 2],
    ["72h", 72 * H, 3],
    ["72h59m", 72 * H + 59 * MIN, 3],
    ["73h", 73 * H, 4],
  ])("%s → %i day(s)", async (_l, ms, expected) => {
    expect(await days(ms)).toBe(expected);
  });
});

describe("quote totals", () => {
  it("3 days, no extras, same branch", async () => {
    const r = await q({ pickupAt: dubai(20), returnAt: dubai(23) });
    expect(r).toMatchObject({
      currency: "AED", days: 3, dailyRateFils: 15000, rentalFils: 45000, extrasFils: 0, oneWayFeeFils: 0,
      subtotalFils: 45000, vatRateBps: 500, vatFils: 2250, totalFils: 47250, depositFils: 100000,
    });
  });

  it("3 days with per-day, multi-quantity and per-rental extras plus a same-city one-way fee", async () => {
    const r = await q({
      pickupAt: dubai(20), returnAt: dubai(23), returnBranchId: w.branchB,
      extras: [
        { extraId: w.extras.GPS, quantity: 1 }, // 2500*3 = 7500 (under the 15000 cap)
        { extraId: w.extras.CHILD_SEAT, quantity: 2 }, // 2000*3 = 6000 each → 12000
        { extraId: w.extras.FULL_INS, quantity: 1 }, // per rental 9900
      ],
    });
    expect(r.extras.find((e) => e.extraId === w.extras.GPS)).toMatchObject({ unitFils: 7500, totalFils: 7500 });
    expect(r.extras.find((e) => e.extraId === w.extras.CHILD_SEAT)).toMatchObject({ quantity: 2, unitFils: 6000, totalFils: 12000 });
    expect(r.extras.find((e) => e.extraId === w.extras.FULL_INS)).toMatchObject({ unitFils: 9900, totalFils: 9900 });
    expect(r).toMatchObject({
      rentalFils: 45000, extrasFils: 29400, oneWayFeeFils: 10000, subtotalFils: 84400, vatFils: 4220, totalFils: 88620, depositFils: 100000,
    });
  });

  it("caps a per-day extra at its max charge for the rental", async () => {
    const r = await q({ pickupAt: dubai(20), returnAt: dubai(27), extras: [{ extraId: w.extras.GPS, quantity: 1 }] });
    // 7 days * 2500 = 17500 → capped at 15000
    expect(r).toMatchObject({ days: 7, rentalFils: 105000, extrasFils: 15000, subtotalFils: 120000, vatFils: 6000, totalFils: 126000 });
  });

  it("charges the inter-city one-way fee (AED 250) for a different city", async () => {
    const p = testPool();
    const far = await makeBranch(p);
    await p.query("update branches set city = 'Abu Dhabi' where id = $1", [far.id]);
    const r = await q({ pickupAt: dubai(20), returnAt: dubai(21), returnBranchId: far.id });
    // 15000 + 25000 = 40000; VAT 2000
    expect(r).toMatchObject({ oneWayFeeFils: 25000, subtotalFils: 40000, vatFils: 2000, totalFils: 42000 });
  });

  it("same city is case-insensitive", async () => {
    const p = testPool();
    const other = await makeBranch(p);
    await p.query("update branches set city = 'DUBAI' where id = $1", [other.id]);
    expect((await q({ pickupAt: dubai(20), returnAt: dubai(21), returnBranchId: other.id })).oneWayFeeFils).toBe(10000);
  });

  it("rejects extra quantities above the maximum and unknown extras", async () => {
    await expect(q({ pickupAt: dubai(20), returnAt: dubai(21), extras: [{ extraId: w.extras.GPS, quantity: 2 }] })).rejects.toSatisfy(
      (e) => isDomainError(e, "VALIDATION"),
    );
    await expect(q({ pickupAt: dubai(20), returnAt: dubai(21), extras: [{ extraId: w.extras.CHILD_SEAT, quantity: 4 }] })).rejects.toSatisfy(
      (e) => isDomainError(e, "VALIDATION"),
    );
    await expect(q({ pickupAt: dubai(20), returnAt: dubai(21), extras: [{ extraId: randomUUID(), quantity: 1 }] })).rejects.toBeTruthy();
  });
});

describe("VAT rounding (5%, half-up on whole fils)", () => {
  async function vehicleAtRate(rate: number) {
    const p = testPool();
    const cat = await makeCategory(p, 50000);
    await p.query("insert into pricing_rules (name, category_id, daily_rate_fils) values ('r', $1, $2)", [cat.id, rate]);
    return (await makeVehicle(p, w.branchA, cat.id)).id;
  }
  it.each([
    [12350, 618], // 617.5 → 618
    [12349, 617], // 617.45 → 617
    [12370, 619], // 618.5 → 619
    [1, 0], // 0.05 → 0
    [10, 1], // 0.5 → 1
  ])("1 day at %i fils → VAT %i", async (rate, vat) => {
    const r = await q({ vehicleId: await vehicleAtRate(rate), pickupAt: dubai(20), returnAt: dubai(21) });
    expect(r.vatFils).toBe(vat);
    expect(r.totalFils).toBe(rate + vat);
    expect(r.depositFils).toBe(50000);
  });
});

describe("pricing rule selection", () => {
  let vehicleId: string;
  let catId: string;
  const ymdDubai = (d: Date) => new Date(d.getTime() + 4 * H).toISOString().slice(0, 10);

  beforeAll(async () => {
    const p = testPool();
    catId = (await makeCategory(p, 200000)).id;
    vehicleId = (await makeVehicle(p, w.branchA, catId)).id;
    const rule = (name: string, rate: number, o: { minDays?: number; branch?: string | null; priority?: number; from?: string; to?: string; active?: boolean } = {}) =>
      p.query(
        `insert into pricing_rules (name, category_id, branch_id, daily_rate_fils, min_days, valid_from, valid_to, priority, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [name, catId, o.branch ?? null, rate, o.minDays ?? 1, o.from ?? null, o.to ?? null, o.priority ?? 0, o.active ?? true],
      );
    await rule("base", 20000);
    await rule("weekly", 16000, { minDays: 7 });
    await rule("monthly", 12000, { minDays: 28 });
    await rule("branch premium", 21000, { branch: w.branchA });
    await rule("inactive cheap", 100, { active: false });
    await rule("peak", 30000, { priority: 10, from: ymdDubai(dubai(100)), to: ymdDubai(dubai(102)) });
  });

  it("branch-specific beats all-branch at equal priority and minDays", async () => {
    expect((await q({ vehicleId, pickupAt: dubai(20), returnAt: dubai(23) })).dailyRateFils).toBe(21000);
  });
  it("higher minDays wins once the rental is long enough (weekly, monthly)", async () => {
    expect((await q({ vehicleId, pickupAt: dubai(20), returnAt: dubai(27) })).dailyRateFils).toBe(16000);
    expect((await q({ vehicleId, pickupAt: dubai(20), returnAt: dubai(26) })).dailyRateFils).toBe(21000);
    const m = await q({ vehicleId, pickupAt: dubai(20), returnAt: dubai(48) });
    expect(m).toMatchObject({ days: 28, dailyRateFils: 12000, rentalFils: 336000, vatFils: 16800, totalFils: 352800, depositFils: 200000 });
  });
  it("priority wins inside its pick-up date window (inclusive), one rate for the whole rental", async () => {
    expect((await q({ vehicleId, pickupAt: dubai(100), returnAt: dubai(110) })).dailyRateFils).toBe(30000);
    expect((await q({ vehicleId, pickupAt: dubai(102, 23), returnAt: dubai(104) })).dailyRateFils).toBe(30000);
    expect((await q({ vehicleId, pickupAt: dubai(99), returnAt: dubai(101) })).dailyRateFils).toBe(21000);
  });
  it("window is matched on the Dubai local date, not UTC (01:00 Dubai = previous day in UTC)", async () => {
    // 01:00 Dubai on day 100 is 21:00 UTC on day 99: still inside the window.
    expect((await q({ vehicleId, pickupAt: dubai(100, 1), returnAt: dubai(101) })).dailyRateFils).toBe(30000);
    // 01:00 Dubai on day 103 is 21:00 UTC on day 102 (inside in UTC) but outside in Dubai local time.
    expect((await q({ vehicleId, pickupAt: dubai(103, 1), returnAt: dubai(104) })).dailyRateFils).toBe(21000);
  });
  it("no matching rule → PRICE_UNAVAILABLE", async () => {
    const p = testPool();
    const cat = await makeCategory(p);
    const v = await makeVehicle(p, w.branchA, cat.id);
    await expect(q({ vehicleId: v.id, pickupAt: dubai(20), returnAt: dubai(21) })).rejects.toSatisfy((e) => isDomainError(e, "PRICE_UNAVAILABLE"));
  });
});
