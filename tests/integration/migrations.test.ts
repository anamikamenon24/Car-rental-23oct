// Q2: migrations apply cleanly to a brand-new database, are idempotent, and seed runs after them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dropDatabase, migrateDatabase, query, recreateDatabase, seedDatabase, seedFile } from "../helpers/db";
import { loadTestEnv, withDatabase } from "../helpers/env";

const cleanUrl = withDatabase(loadTestEnv().testUrl, "driveeasy_test_clean");

const EXPECTED_TABLES = [
  "users", "sessions", "accounts", "verifications", "driver_profiles", "branches", "vehicle_categories",
  "vehicles", "vehicle_features", "vehicle_feature_map", "pricing_rules", "extras", "reservations",
  "reservation_extras", "payments", "deposits", "payment_webhook_events", "rental_agreements",
  "damage_reports", "maintenance_blocks", "audit_logs",
];

describe("migrations on a clean database", () => {
  beforeAll(async () => {
    await recreateDatabase(cleanUrl);
  });
  afterAll(async () => {
    await dropDatabase(cleanUrl);
  });

  it("applies every migration from scratch", async () => {
    expect(await migrateDatabase(cleanUrl)).toBe(true);
    const rows = await query<{ tablename: string }>(cleanUrl, "select tablename from pg_tables where schemaname = 'public'");
    const tables = rows.map((r) => r.tablename);
    for (const t of EXPECTED_TABLES) expect(tables, `table ${t}`).toContain(t);
  });

  it("is idempotent (re-running migrate is a no-op)", async () => {
    await expect(migrateDatabase(cleanUrl)).resolves.toBe(true);
  });

  it("creates the overlap exclusion constraints and the cross-table guard triggers", async () => {
    const cons = await query<{ conname: string; contype: string }>(
      cleanUrl,
      "select conname, contype from pg_constraint where conname in ('reservations_no_overlap','maintenance_blocks_no_overlap')",
    );
    expect(cons.map((c) => c.conname).sort()).toEqual(["maintenance_blocks_no_overlap", "reservations_no_overlap"]);
    expect(cons.every((c) => c.contype === "x")).toBe(true);
    const trg = await query<{ tgname: string }>(cleanUrl, "select tgname from pg_trigger where not tgisinternal");
    expect(trg.map((t) => t.tgname)).toEqual(
      expect.arrayContaining(["reservations_maintenance_guard", "maintenance_blocks_reservation_guard"]),
    );
    const ext = await query(cleanUrl, "select 1 from pg_extension where extname = 'btree_gist'");
    expect(ext).toHaveLength(1);
  });

  it.runIf(!!seedFile())("seeds the clean database (branches, vehicles, admin + customer)", async () => {
    expect(await seedDatabase(cleanUrl)).toBe(true);
    const [counts] = await query<{ branches: number; vehicles: number; admins: number; customers: number }>(
      cleanUrl,
      `select (select count(*)::int from branches) as branches, (select count(*)::int from vehicles) as vehicles,
              (select count(*)::int from users where role = 'ADMIN') as admins,
              (select count(*)::int from users where role = 'CUSTOMER') as customers`,
    );
    expect(counts.branches).toBeGreaterThan(0);
    expect(counts.vehicles).toBeGreaterThan(0);
    expect(counts.admins).toBeGreaterThan(0);
    expect(counts.customers).toBeGreaterThan(0);
    const tz = await query<{ time_zone: string }>(cleanUrl, "select distinct time_zone from branches");
    expect(tz.map((r) => r.time_zone)).toEqual(["Asia/Dubai"]);
  });

  it.runIf(!!seedFile())("seed is re-runnable on an already seeded database", async () => {
    await expect(seedDatabase(cleanUrl)).resolves.toBe(true);
  });
});
