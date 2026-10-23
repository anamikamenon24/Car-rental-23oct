import { describe, expect, it } from "vitest";
import { query } from "../helpers/db";
import { databaseName, loadTestEnv } from "../helpers/env";

describe("test harness", () => {
  const { testUrl, devUrl } = loadTestEnv();

  it("points the app pool at driveeasy_test, never the dev database", async () => {
    expect(databaseName(process.env.DATABASE_URL!)).toBe(databaseName(testUrl));
    expect(databaseName(testUrl)).not.toBe(devUrl ? databaseName(devUrl) : "");
    const { pool } = await import("@/db");
    const { rows } = await pool.query<{ db: string }>("select current_database() as db");
    expect(rows[0].db).toBe(databaseName(testUrl));
  });

  it("has btree_gist available for exclusion constraints", async () => {
    const rows = await query<{ ok: boolean }>(
      testUrl,
      "select exists(select 1 from pg_available_extensions where name = 'btree_gist') as ok",
    );
    expect(rows[0].ok).toBe(true);
  });
});
