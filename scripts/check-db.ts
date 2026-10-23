// Checks both local databases: connection, btree_gist, and a no-overlap rule.
// Everything runs in a rolled-back transaction, so nothing is left behind.
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

async function check(label: string, url: string | undefined): Promise<boolean> {
  if (!url) {
    console.log(`✗ ${label}: URL not set`);
    return false;
  }
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const info = await client.query<{ db: string; who: string; ext: string | null }>(
      `select current_database() as db, current_user as who,
              (select extversion from pg_extension where extname = 'btree_gist') as ext`,
    );
    const { db, who, ext } = info.rows[0];
    if (!ext) throw new Error("btree_gist is not installed");

    await client.query("begin");
    await client.query(`
      create temp table overlap_check (
        vehicle_id int not null,
        during tstzrange not null,
        exclude using gist (vehicle_id with =, during with &&)
      ) on commit drop`);
    await client.query(`insert into overlap_check values (1, '[2026-01-01 10:00, 2026-01-03 10:00)')`);
    await client.query(`insert into overlap_check values (2, '[2026-01-02 10:00, 2026-01-04 10:00)')`);
    let blocked = false;
    try {
      await client.query("savepoint s");
      await client.query(`insert into overlap_check values (1, '[2026-01-02 10:00, 2026-01-04 10:00)')`);
    } catch (err) {
      blocked = (err as { code?: string }).code === "23P01"; // exclusion_violation
    }
    await client.query("rollback");
    if (!blocked) throw new Error("overlapping rental was not rejected");

    console.log(`✓ ${label}: ${db} as ${who}, btree_gist ${ext}, overlapping rentals rejected`);
    return true;
  } catch (err) {
    console.log(`✗ ${label}: ${err instanceof Error ? err.message : err}`);
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const results = [
    await check("dev ", process.env.DATABASE_URL),
    await check("test", process.env.TEST_DATABASE_URL),
  ];
  process.exit(results.every(Boolean) ? 0 : 1);
}

main();
