// Loads .env.local for tests and works out which databases tests may touch.
// Tests never use the dev database: integration runs on TEST_DATABASE_URL,
// e2e runs on a sibling database (driveeasy_e2e) derived from it.
import { config } from "dotenv";
import path from "node:path";

const root = typeof __dirname !== "undefined" ? path.resolve(__dirname, "../..") : process.cwd();
let loaded = false;
let devUrlAtLoad: string | undefined;

export function loadTestEnv() {
  if (!loaded) {
    config({ path: path.join(root, ".env.local"), quiet: true });
    devUrlAtLoad = process.env.DATABASE_URL;
    loaded = true;
  }
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL is not set in .env.local");
  if (devUrlAtLoad && sameDatabase(devUrlAtLoad, testUrl)) {
    throw new Error("TEST_DATABASE_URL points at the dev database; refusing to run tests");
  }
  return { root, devUrl: devUrlAtLoad, testUrl, e2eUrl: withDatabase(testUrl, "driveeasy_e2e") };
}

export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

function sameDatabase(a: string, b: string) {
  const ua = new URL(a);
  const ub = new URL(b);
  return ua.host === ub.host && ua.pathname === ub.pathname;
}

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_CRON_SECRET = "e2e-cron-secret";
