import { defineConfig, devices } from "@playwright/test";
import { E2E_BASE_URL, E2E_CRON_SECRET, E2E_PORT, loadTestEnv } from "./tests/helpers/env";

// E2E runs its own Next server on :3100 against driveeasy_e2e (reset + seeded in global setup),
// so it never touches dev data and can run beside `pnpm dev`.
//   pnpm test:e2e                     dev server (next dev), own distDir .next-e2e
//   E2E_MODE=prod pnpm test:e2e       production build + next start (NODE_ENV=production)
const { e2eUrl } = loadTestEnv();
const prod = process.env.E2E_MODE === "prod";
const distDir = prod ? ".next-e2e-prod" : ".next-e2e";

const serverEnv: Record<string, string> = {
  DATABASE_URL: e2eUrl,
  NEXT_DIST_DIR: distDir,
  NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
  BETTER_AUTH_URL: E2E_BASE_URL,
  CRON_SECRET: E2E_CRON_SECRET,
  PAYMENTS_WEBHOOK_SECRET: "e2e-webhook-secret",
  RESERVATION_HOLD_MINUTES: "15",
  PAYMENT_PROVIDER: "fake",
  FAKE_PAYMENTS_WEBHOOK_URL: `${E2E_BASE_URL}/api/webhooks/payments`,
  FAKE_PAYMENTS_DUPLICATE_DELIVERIES: process.env.FAKE_PAYMENTS_DUPLICATE_DELIVERIES ?? "1",
  STORAGE_PROVIDER: "local",
  UPLOADS_DIR: "storage/e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, dependencies: ["setup"] },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] },
  ],
  webServer: {
    command: prod
      ? `pnpm exec tsx scripts/prepare-e2e.ts && pnpm exec next build && pnpm exec next start --port ${E2E_PORT}`
      : `pnpm exec tsx scripts/prepare-e2e.ts && pnpm exec next dev --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    env: prod ? { ...serverEnv, NODE_ENV: "production" } : serverEnv,
    reuseExistingServer: !process.env.CI && !prod,
    timeout: prod ? 600_000 : 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
