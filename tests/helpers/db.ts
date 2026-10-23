// Database helpers for tests: create, migrate, truncate and seed a throwaway database.
// Every function takes an explicit URL and refuses anything but driveeasy_test / driveeasy_e2e*.
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { databaseName, loadTestEnv, withDatabase } from "./env";

const SAFE_DB = /^driveeasy_(test|e2e)(_[a-z0-9_]+)?$/;

function assertSafe(url: string) {
  const name = databaseName(url);
  if (!SAFE_DB.test(name)) throw new Error(`Refusing to modify database "${name}" from tests`);
}

async function withClient<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Creates the database if it does not exist (role needs CREATEDB). */
export async function ensureDatabase(url: string) {
  assertSafe(url);
  const name = databaseName(url);
  await withClient(withDatabase(url, "postgres"), async (c) => {
    const found = await c.query("select 1 from pg_database where datname = $1", [name]);
    if (found.rowCount === 0) await c.query(`create database "${name}"`);
  });
}

/** Drops and recreates the database: a truly clean slate. */
export async function recreateDatabase(url: string) {
  assertSafe(url);
  const name = databaseName(url);
  await withClient(withDatabase(url, "postgres"), async (c) => {
    await c.query(`drop database if exists "${name}" with (force)`);
    await c.query(`create database "${name}"`);
  });
}

export async function dropDatabase(url: string) {
  assertSafe(url);
  const name = databaseName(url);
  await withClient(withDatabase(url, "postgres"), (c) => c.query(`drop database if exists "${name}" with (force)`));
}

export function migrationsFolder() {
  return path.join(loadTestEnv().root, "drizzle");
}

export function hasMigrations() {
  return existsSync(path.join(migrationsFolder(), "meta", "_journal.json"));
}

export async function migrateDatabase(url: string) {
  assertSafe(url);
  if (!hasMigrations()) return false;
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
  return true;
}

/** Empties every table in the public schema (the drizzle journal lives in its own schema). */
export async function truncateAll(url: string) {
  assertSafe(url);
  await withClient(url, async (c) => {
    const { rows } = await c.query<{ t: string }>(
      `select quote_ident(tablename) as t from pg_tables where schemaname = 'public'`,
    );
    if (rows.length) await c.query(`truncate ${rows.map((r) => r.t).join(", ")} restart identity cascade`);
  });
}

const SEED_CANDIDATES = ["src/db/seed.ts", "scripts/seed.ts"];

export function seedFile() {
  const root = loadTestEnv().root;
  return SEED_CANDIDATES.map((f) => path.join(root, f)).find((f) => existsSync(f));
}

/**
 * Runs the seed in a child process with DATABASE_URL pointed at `url`, so that anything the seed
 * reaches through @/db or Better Auth (password hashing, user creation) lands in the same database.
 */
export async function seedDatabase(url: string) {
  assertSafe(url);
  if (!seedFile()) return false;
  const { root } = loadTestEnv();
  const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url };
  const res = spawnSync("pnpm", ["run", "--silent", "db:seed"], { cwd: root, env, encoding: "utf8", shell: true });
  if (res.status !== 0) throw new Error(`pnpm db:seed failed (exit ${res.status}): ${(res.stderr || res.stdout).slice(-2000)}`);
  return true;
}

/** Full reset: create if needed, migrate, truncate, seed. */
export async function resetDatabase(url: string, { seed = true } = {}) {
  await ensureDatabase(url);
  await migrateDatabase(url);
  await truncateAll(url);
  if (seed) await seedDatabase(url);
}

export async function query<T extends object = Record<string, unknown>>(
  url: string,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withClient(url, async (c) => (await c.query<T>(text, params)).rows);
}
