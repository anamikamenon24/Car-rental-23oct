// Playwright fixtures: `customerPage` and `adminPage` start already signed in as the seeded users
// (sessions saved by auth.setup.ts). `page` stays anonymous.
import path from "node:path";
import { test as base, expect, type Browser, type BrowserContextOptions, type Page, type TestInfo } from "@playwright/test";
import type { Credentials } from "../../helpers/credentials";
import { E2E_BASE_URL } from "../../helpers/env";

const authDir = path.resolve(process.cwd(), "tests/e2e/.auth");
export const STORAGE_STATE = {
  customer: path.join(authDir, "customer.json"),
  admin: path.join(authDir, "admin.json"),
} as const;

export async function login(page: Page, { email, password }: Credentials) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 45_000 });
}

const CONTEXT_KEYS = ["baseURL", "viewport", "userAgent", "deviceScaleFactor", "isMobile", "hasTouch", "locale", "timezoneId"] as const;

/** A context with this project's device settings, signed in as `role`. */
export async function pageFor(browser: Browser, testInfo: TestInfo, role: keyof typeof STORAGE_STATE | null, provide: (p: Page) => Promise<void>) {
  const projectUse = testInfo.project.use as Record<string, unknown>;
  const options: BrowserContextOptions = Object.fromEntries(CONTEXT_KEYS.filter((k) => projectUse[k] !== undefined).map((k) => [k, projectUse[k]]));
  options.baseURL ??= E2E_BASE_URL;
  if (role) options.storageState = STORAGE_STATE[role];
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await provide(page);
  await context.close();
}

export const test = base.extend<{ customerPage: Page; adminPage: Page }>({
  customerPage: async ({ browser }, use, testInfo) => pageFor(browser, testInfo, "customer", use),
  adminPage: async ({ browser }, use, testInfo) => pageFor(browser, testInfo, "admin", use),
});

export { expect };
