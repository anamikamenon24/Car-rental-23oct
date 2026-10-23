// Q6: expired holds are released automatically, the release is idempotent, the cron route is protected,
// and `pnpm jobs release-expired-holds` works.
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { closeTestPool, dubai, makeWorld, newKey, testPool, type World } from "../helpers/world";

const { createReservationHold, payReservation } = await import("@/server/reservations");
const { releaseExpiredHolds } = await import("@/server/holds");
const { isDomainError } = await import("@/server/errors");
const cron = await import("@/app/api/cron/release-expired-holds/route");

const { testUrl, root } = loadTestEnv();
let w: World;

beforeAll(async () => {
  await truncateAll(testUrl);
  w = await makeWorld();
});
afterAll(closeTestPool);

async function newHold(daysOut: number) {
  return createReservationHold(w.customer, {
    vehicleId: w.vehicleId,
    pickupBranchId: w.branchA,
    returnBranchId: w.branchA,
    pickupAt: dubai(daysOut),
    returnAt: dubai(daysOut + 2),
    idempotencyKey: newKey(),
  });
}
const status = async (id: string) =>
  (await testPool().query<{ status: string }>("select status from reservations where id = $1", [id])).rows[0].status;
const expireNow = (id: string) =>
  testPool().query("update reservations set hold_expires_at = now() - interval '1 minute' where id = $1", [id]);

describe("expired holds", () => {
  it("hold expiry is RESERVATION_HOLD_MINUTES (default 15) from creation", async () => {
    const before = Date.now();
    const h = await newHold(40);
    const mins = (h.holdExpiresAt.getTime() - before) / 60_000;
    expect(mins).toBeGreaterThan(14.9);
    expect(mins).toBeLessThan(15.2);
  });

  it("releases only expired PENDING holds, and a second run releases nothing", async () => {
    const expired = await newHold(50);
    const live = await newHold(60);
    await expireNow(expired.reservationId);
    const first = await releaseExpiredHolds({});
    expect(first.reservationIds).toContain(expired.reservationId);
    expect(first.reservationIds).not.toContain(live.reservationId);
    expect(await status(expired.reservationId)).toBe("EXPIRED");
    expect(await status(live.reservationId)).toBe("PENDING");
    const second = await releaseExpiredHolds({});
    expect(second.count).toBe(0);
  });

  it("concurrent release runs do not double-process", async () => {
    // Create all holds first: a new hold on the same car expires stale holds itself.
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await newHold(70 + i * 3)).reservationId);
    for (const id of ids) await expireNow(id);
    const runs = await Promise.all([releaseExpiredHolds({}), releaseExpiredHolds({}), releaseExpiredHolds({})]);
    expect(runs.reduce((n, r) => n + r.count, 0)).toBe(5);
  });

  it("an expired hold frees the car for someone else even before the job runs", async () => {
    const h = await newHold(100);
    await expireNow(h.reservationId);
    await expect(
      createReservationHold(w.other, {
        vehicleId: w.vehicleId, pickupBranchId: w.branchA, returnBranchId: w.branchA,
        pickupAt: dubai(100), returnAt: dubai(102), idempotencyKey: newKey(),
      }),
    ).resolves.toMatchObject({ reservationId: expect.any(String) });
  });

  it("paying an expired hold fails with HOLD_EXPIRED", async () => {
    const h = await newHold(110);
    await expireNow(h.reservationId);
    await expect(
      payReservation(w.customer, { reservationId: h.reservationId, paymentMethod: "pm_fake_success", idempotencyKey: newKey() }),
    ).rejects.toSatisfy((e) => isDomainError(e, "HOLD_EXPIRED"));
  });
});

describe("cron route GET /api/cron/release-expired-holds", () => {
  const call = (auth?: string) =>
    cron.GET(new Request("http://localhost/api/cron/release-expired-holds", { headers: auth ? { authorization: auth } : {} }) as never);

  it("401 without or with a wrong secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("test-cron-secret")).status).toBe(401);
  });

  it("refuses to run when CRON_SECRET is not configured", async () => {
    const saved = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      expect([401, 500, 503]).toContain((await call("Bearer ")).status);
      expect([401, 500, 503]).toContain((await call("Bearer undefined")).status);
    } finally {
      process.env.CRON_SECRET = saved;
    }
  });

  it("200 with the secret, idempotent on repeat", async () => {
    const h = await newHold(130);
    await expireNow(h.reservationId);
    const r1 = await call("Bearer test-cron-secret");
    expect(r1.status).toBe(200);
    expect(await status(h.reservationId)).toBe("EXPIRED");
    const r2 = await call("Bearer test-cron-secret");
    expect(r2.status).toBe(200);
    const body = (await r2.json()) as { count?: number };
    expect(body.count ?? 0).toBe(0);
  });
});

describe("pnpm jobs release-expired-holds", () => {
  it("releases expired holds from the CLI", async () => {
    const h = await newHold(150);
    await expireNow(h.reservationId);
    const res = spawnSync("pnpm", ["run", "--silent", "jobs", "release-expired-holds"], {
      cwd: root, shell: true, encoding: "utf8", env: { ...process.env, DATABASE_URL: testUrl },
    });
    expect(res.status, res.stderr).toBe(0);
    expect(await status(h.reservationId)).toBe("EXPIRED");
  }, 60_000);
});
