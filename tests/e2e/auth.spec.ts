// Q3: registration, login, logout, and route protection for anonymous / customer / admin.
import { randomUUID } from "node:crypto";
import { seedUsers } from "../helpers/credentials";
import { expect, login, test } from "./fixtures/auth";

test.describe("registration, login, logout", () => {
  test("a new customer can register, log out and log back in", async ({ page }) => {
    const email = `e2e-${randomUUID().slice(0, 8)}@test.driveeasy.ae`;
    const password = `Pw-${randomUUID()}`;
    await page.goto("/register");
    await page.getByTestId("register-name").fill("E2E Customer");
    await page.getByTestId("register-email").fill(email);
    await page.getByTestId("register-password").fill(password);
    await page.getByTestId("register-submit").click();
    await expect(page).not.toHaveURL(/\/register/);

    await page.goto("/account/rentals");
    await expect(page).toHaveURL(/\/account\/rentals/);

    await logout(page);
    await page.goto("/account/rentals");
    await expect(page).toHaveURL(/\/login/);

    await login(page, { email, password });
    await page.goto("/account/rentals");
    await expect(page).toHaveURL(/\/account\/rentals/);
  });

  test("registering an existing email is rejected", async ({ page }) => {
    const { customer } = await seedUsers();
    await page.goto("/register");
    await page.getByTestId("register-name").fill("Dup");
    await page.getByTestId("register-email").fill(customer.email);
    await page.getByTestId("register-password").fill(`Pw-${randomUUID()}`);
    await page.getByTestId("register-submit").click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByTestId("register-error")).toBeVisible();
  });

  test("wrong password is rejected", async ({ page }) => {
    const { customer } = await seedUsers();
    await page.goto("/login");
    await page.getByTestId("login-email").fill(customer.email);
    await page.getByTestId("login-password").fill("definitely-wrong-password");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("login-error")).toBeVisible();
  });
});

test.describe("authorisation", () => {
  for (const path of ["/account/rentals", "/account/profile", "/admin", "/admin/fleet"]) {
    test(`anonymous visitor is sent to login from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  for (const path of ["/admin", "/admin/fleet", "/admin/pricing", "/admin/reservations", "/admin/branches"]) {
    test(`customer cannot open ${path}`, async ({ customerPage }) => {
      const res = await customerPage.goto(path);
      const blocked = !customerPage.url().includes("/admin") || res?.status() === 403 || res?.status() === 404;
      expect(blocked, `customer reached ${customerPage.url()} (${res?.status()})`).toBe(true);
    });
  }

  test("admin can open the admin area", async ({ adminPage }) => {
    for (const path of ["/admin", "/admin/fleet", "/admin/pricing", "/admin/reservations"]) {
      const res = await adminPage.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(adminPage).toHaveURL(new RegExp(path.replace("/", "\\/")));
    }
  });
});

async function logout(page: import("@playwright/test").Page) {
  await page.goto("/");
  const button = page.getByTestId("logout");
  if (!(await button.isVisible())) {
    // On mobile the logout lives inside the menu.
    await page.getByRole("button", { name: /menu|account/i }).first().click();
  }
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("logout")).toHaveCount(0);
}
