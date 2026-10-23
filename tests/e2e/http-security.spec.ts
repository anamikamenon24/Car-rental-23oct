// Q3, Q6, Q8, Q10 over real HTTP against the e2e server: cron auth, webhook signatures,
// private licence files, cross-user pages, and admin routes for customers.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import { seedUsers } from "../helpers/credentials";
import { E2E_BASE_URL, E2E_CRON_SECRET } from "../helpers/env";
import { STORAGE_STATE, expect, test } from "./fixtures/auth";
import { e2eQuery } from "./fixtures/data";

const png = readFileSync(path.resolve(process.cwd(), "tests/e2e/fixtures/licence.png"));

async function session(role: "customer" | "admin" | "anon" | "fresh"): Promise<APIRequestContext> {
  if (role === "anon") return pwRequest.newContext({ baseURL: E2E_BASE_URL });
  if (role === "fresh") {
    const ctx = await pwRequest.newContext({ baseURL: E2E_BASE_URL });
    const res = await ctx.post("/api/auth/sign-up/email", {
      data: { name: "Other Customer", email: `other-${randomUUID().slice(0, 8)}@test.driveeasy.ae`, password: `Pw-${randomUUID()}` },
      headers: { origin: E2E_BASE_URL },
    });
    expect(res.ok(), await res.text()).toBe(true);
    return ctx;
  }
  return pwRequest.newContext({ baseURL: E2E_BASE_URL, storageState: STORAGE_STATE[role] });
}

async function customerReservationId() {
  const { customer } = await seedUsers();
  const [r] = await e2eQuery<{ id: string }>(
    `select r.id from reservations r join users u on u.id = r.user_id
     where u.email = $1 and r.status in ('CONFIRMED','PICKED_UP') order by r.pickup_at limit 1`,
    [customer.email],
  );
  expect(r, "seed should include a confirmed reservation for the customer").toBeTruthy();
  return r.id;
}

test.describe("cron endpoint", () => {
  test("401 without / with a wrong secret, 200 and idempotent with the secret", async () => {
    const anon = await session("anon");
    expect((await anon.get("/api/cron/release-expired-holds")).status()).toBe(401);
    expect((await anon.get("/api/cron/release-expired-holds", { headers: { authorization: "Bearer nope" } })).status()).toBe(401);
    const ok1 = await anon.get("/api/cron/release-expired-holds", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect(ok1.status()).toBe(200);
    const ok2 = await anon.get("/api/cron/release-expired-holds", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect(ok2.status()).toBe(200);
  });
});

test.describe("payment webhook endpoint", () => {
  test("rejects unsigned and badly signed events", async () => {
    const anon = await session("anon");
    const body = JSON.stringify({ id: `evt_forged_${randomUUID()}`, type: "payment.succeeded", createdAt: new Date().toISOString(), data: {} });
    const variants: Record<string, string>[] = [{}, { "fake-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` }];
    for (const headers of variants) {
      const res = await anon.post("/api/webhooks/payments", { data: body, headers: { "content-type": "application/json", ...headers } });
      expect([400, 401]).toContain(res.status());
    }
    const [n] = await e2eQuery<{ n: number }>("select count(*)::int as n from payment_webhook_events where event_id like 'evt_forged_%'");
    expect(n.n).toBe(0);
  });
});

test.describe("private licence files", () => {
  test("only the owner and admins can download a licence image", async () => {
    const owner = await session("customer");
    const up = await owner.post("/api/uploads/licence?side=front", {
      multipart: { file: { name: "licence.png", mimeType: "image/png", buffer: png } },
      headers: { origin: E2E_BASE_URL },
    });
    expect(up.ok(), await up.text()).toBe(true);
    const { url, key } = (await up.json()) as { url: string; key: string };
    expect(key).toBeTruthy();

    expect((await owner.get(url)).status()).toBe(200);
    expect((await (await session("admin")).get(url)).status()).toBe(200);
    const other = await (await session("fresh")).get(url);
    expect([403, 404]).toContain(other.status());
    const anon = await (await session("anon")).get(url, { maxRedirects: 0 });
    expect([302, 303, 307, 401, 403, 404]).toContain(anon.status());
  });

  test("path traversal in the file route is refused", async () => {
    const admin = await session("admin");
    for (const p of ["/api/files/..%2f..%2f.env.local", "/api/files/licences/..%2f..%2f..%2fpackage.json"]) {
      expect((await admin.get(p)).status()).toBeGreaterThanOrEqual(400);
    }
  });

  test("anonymous and customer uploads to admin-only buckets are refused", async () => {
    for (const who of ["anon", "customer"] as const) {
      const ctx = await session(who);
      for (const route of ["/api/uploads/damage", "/api/uploads/vehicle-photo"]) {
        const res = await ctx.post(route, {
          multipart: { file: { name: "x.png", mimeType: "image/png", buffer: png } },
          headers: { origin: E2E_BASE_URL },
        });
        expect([401, 403], `${who} ${route}`).toContain(res.status());
      }
    }
  });
});

test.describe("cross-user pages", () => {
  test("another customer cannot open someone else's reservation or voucher", async ({ browser }) => {
    const id = await customerReservationId();
    const ctx = await browser.newContext({ baseURL: E2E_BASE_URL });
    const other = await session("fresh");
    await ctx.addCookies((await other.storageState()).cookies);
    const page = await ctx.newPage();
    for (const p of [`/account/rentals/${id}`, `/account/rentals/${id}/voucher`, `/checkout/${id}`]) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(404);
      await expect(page.getByTestId("voucher-reference")).toHaveCount(0);
    }
    await ctx.close();
  });

  test("the owner can open their reservation and voucher", async ({ customerPage }) => {
    const id = await customerReservationId();
    expect((await customerPage.goto(`/account/rentals/${id}`))?.status()).toBe(200);
    expect((await customerPage.goto(`/account/rentals/${id}/voucher`))?.status()).toBe(200);
    await expect(customerPage.getByTestId("voucher-reference")).toBeVisible();
  });
});

test.describe("admin pages for customers", () => {
  test("customer gets 404/redirect for admin detail pages", async ({ customerPage }) => {
    const id = await customerReservationId();
    const [v] = await e2eQuery<{ id: string }>("select id from vehicles limit 1");
    for (const p of [`/admin/reservations/${id}`, `/admin/fleet/${v.id}`, "/admin/pricing", "/admin/branches"]) {
      const res = await customerPage.goto(p);
      const blocked = res?.status() === 404 || res?.status() === 403 || !customerPage.url().includes("/admin");
      expect(blocked, p).toBe(true);
      await expect(customerPage.getByTestId("checkin-submit")).toHaveCount(0);
      await expect(customerPage.getByTestId("checkout-submit")).toHaveCount(0);
    }
  });
});
