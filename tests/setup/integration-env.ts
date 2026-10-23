// Runs in each integration worker before test files import app code:
// point the app's own pool (src/db/index.ts) at the test database.
import { afterAll } from "vitest";
import { loadTestEnv } from "../helpers/env";

const { testUrl } = loadTestEnv();
process.env.DATABASE_URL = testUrl;
process.env.CRON_SECRET = "test-cron-secret";
process.env.PAYMENT_PROVIDER = "fake";
process.env.PAYMENTS_WEBHOOK_SECRET = "test-webhook-secret";
process.env.RESERVATION_HOLD_MINUTES = "15";
process.env.FAKE_PAYMENTS_WEBHOOK_URL = "";
process.env.FAKE_PAYMENTS_DUPLICATE_DELIVERIES = "0";

afterAll(async () => {
  const g = globalThis as unknown as { pool?: { end(): Promise<void> } };
  await g.pool?.end().catch(() => {});
  g.pool = undefined;
});
