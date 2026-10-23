import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// One pool per process; reused across dev-server hot reloads.
export const pool = (globalForDb.pool ??= new Pool({ connectionString: process.env.DATABASE_URL }));

export const db = drizzle(pool, { schema });
export type Db = typeof db;
