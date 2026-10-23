// Q11: key pages render without horizontal overflow on every project (desktop + Pixel 7).
import type { Page } from "@playwright/test";
import { branches, localDateTime, searchUrl } from "./fixtures/data";
import { expect, test } from "./fixtures/auth";

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `page ${page.url()} is ${scrollWidth}px wide in a ${innerWidth}px viewport`).toBeLessThanOrEqual(innerWidth);
}

test.describe("layout: public pages", () => {
  test("home, search, branches, login, register", async ({ page }) => {
    const [b] = await branches();
    const paths = [
      "/",
      searchUrl({ pickupBranch: b.id, pickupAt: localDateTime(10), returnAt: localDateTime(13) }),
      "/branches",
      `/branches/${b.slug}`,
      "/login",
      "/register",
    ];
    for (const p of paths) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBeLessThan(400);
      await expectNoHorizontalOverflow(page);
    }
  });

  test("not-found page", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist");
    expect(res?.status()).toBe(404);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("layout: signed-in pages", () => {
  test("customer account pages", async ({ customerPage }) => {
    for (const p of ["/account/rentals", "/account/profile"]) {
      await customerPage.goto(p);
      await expectNoHorizontalOverflow(customerPage);
    }
  });

  test("admin pages", async ({ adminPage }) => {
    for (const p of ["/admin", "/admin/branches", "/admin/fleet", "/admin/pricing", "/admin/reservations"]) {
      await adminPage.goto(p);
      await expectNoHorizontalOverflow(adminPage);
    }
  });
});

