// Applies drizzle/ migrations (generated + custom SQL) programmatically.
//   pnpm db:migrate:deploy      used by `pnpm vercel-build` before `next build`
// Uses the direct (unpooled) connection when available: Neon's pooled endpoint (PgBouncer in
// transaction mode) is fine for the app at runtime but not for DDL/migrations.
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const started = Date.now();
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const host = new URL(url).hostname;
    console.log(JSON.stringify({ level: "info", msg: "migrations applied", host, ms: Date.now() - started }));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "migration failed", error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
