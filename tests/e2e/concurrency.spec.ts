// Q5 over HTTP: two signed-in browser sessions submit the driver step (which creates the hold) for the
// same car and overlapping dates at the same moment. Exactly one reaches checkout.
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { E2E_BASE_URL } from "../helpers/env";
import { STORAGE_STATE, expect, test } from "./fixtures/auth";
import { branches, dayOffset, e2eQuery, localDateTime, vehicleAt } from "./fixtures/data";

test.describe.configure({ mode: "serial" });
test.skip(({ browserName, isMobile }) => browserName !== "chromium" || !!isMobile, "HTTP race runs once (chromium desktop)");

async function toDriverStep(page: Page, vehicleId: string, pickupBranch: string, from: number, to: number) {
  const qs = new URLSearchParams({ pickupBranch, returnBranch: pickupBranch, pickupAt: localDateTime(from), returnAt: localDateTime(to) });
  await page.goto(`/book/${vehicleId}?${qs}`);
  await page.getByTestId("book-continue").click();
  await expect(page).toHaveURL(/\/extras/);
  await page.getByTestId("book-continue").click();
  await expect(page).toHaveURL(/\/driver/);
}

async function signUpPage(browser: import("@playwright/test").Browser) {
  const ctx = await browser.newContext({ baseURL: E2E_BASE_URL });
  const res = await ctx.request.post("/api/auth/sign-up/email", {
    data: { name: "Racer", email: `racer-${randomUUID().slice(0, 8)}@test.driveeasy.ae`, password: `Pw-${randomUUID()}` },
    headers: { origin: E2E_BASE_URL },
  });
  expect(res.ok()).toBe(true);
  return ctx.newPage();
}

test("two sessions racing for the same car: exactly one hold (10 rounds)", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const dxb = (await branches()).find((b) => b.code === "DXB")!;
  const vehicle = await vehicleAt(dxb.id);
  const a = await (await browser.newContext({ baseURL: E2E_BASE_URL, storageState: STORAGE_STATE.customer })).newPage();
  const b = await signUpPage(browser);

  for (let i = 0; i < 10; i++) {
    const from = dayOffset(testInfo.project.name, 20 + i);
    await toDriverStep(a, vehicle.id, dxb.id, from, from + 3);
    await toDriverStep(b, vehicle.id, dxb.id, from + 1, from + 4);
    for (const p of [a, b]) {
      for (const [id, v] of [["driver-full-name", "Racer"], ["driver-phone", "+971500000001"], ["driver-dob", "1990-01-01"], ["driver-licence-number", "R-1"], ["driver-licence-expires", "2033-01-01"]]) {
        const f = p.getByTestId(id);
        if ((await f.count()) && !(await f.inputValue())) await f.fill(v);
      }
      const c = p.getByTestId("driver-licence-country");
      if ((await c.count()) && (await c.evaluate((e) => e.tagName)) === "SELECT") await c.selectOption("AE");
      else if ((await c.count()) && !(await c.inputValue())) await c.fill("AE");
    }
    await Promise.all([a.getByTestId("book-continue").click(), b.getByTestId("book-continue").click()]);
    await Promise.all([a.waitForLoadState("networkidle"), b.waitForLoadState("networkidle")]);
    const reached = [a, b].filter((p) => /\/checkout\//.test(p.url()));
    expect(reached, `round ${i}`).toHaveLength(1);
    const loser = [a, b].find((p) => !/\/checkout\//.test(p.url()))!;
    await expect(loser.getByText(/not available|unavailable/i).first()).toBeVisible();
  }

  const [n] = await e2eQuery<{ n: number }>(
    `select count(*)::int as n from reservations where vehicle_id = $1 and status = 'PENDING'`,
    [vehicle.id],
  );
  expect(n.n).toBeGreaterThanOrEqual(10);
});
