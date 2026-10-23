// Builds an isolated, deterministic data set in driveeasy_test for service-level tests.
// Rows are created with raw SQL (no service code) so tests exercise services against known inputs.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { loadTestEnv } from "./env";
import { makeBranch, makeCategory, makeUser, makeVehicle } from "./factory";

export interface Actor {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
  image: string | null;
}

let pool: Pool | undefined;
export function testPool() {
  return (pool ??= new Pool({ connectionString: loadTestEnv().testUrl, max: 10 }));
}
export async function closeTestPool() {
  await pool?.end();
  pool = undefined;
}

export async function makeActor(role: "CUSTOMER" | "ADMIN" = "CUSTOMER", { withDriver = true } = {}): Promise<Actor> {
  const p = testPool();
  const u = await makeUser(p, { role });
  if (withDriver) {
    await p.query(
      `insert into driver_profiles (user_id, full_name, date_of_birth, phone, licence_number, licence_country, licence_expires_on)
       values ($1, 'Test Driver', '1990-05-05', '+971500000000', $2, 'AE', '2035-01-01')`,
      [u.id, `L-${randomUUID().slice(0, 8)}`],
    );
  }
  return { id: u.id, name: "Test User", email: u.email, role, image: null };
}

export interface World {
  branchA: string;
  branchB: string;
  categoryId: string;
  vehicleId: string;
  depositFils: number;
  dailyRateFils: number;
  customer: Actor;
  other: Actor;
  admin: Actor;
  extras: Record<"GPS" | "CHILD_SEAT" | "FULL_INS", string>;
}

/** One vehicle at branchA, a flat pricing rule, three extras, two customers and an admin. */
export async function makeWorld(opts: { dailyRateFils?: number; depositFils?: number } = {}): Promise<World> {
  const p = testPool();
  const dailyRateFils = opts.dailyRateFils ?? 15000; // AED 150.00
  const depositFils = opts.depositFils ?? 100000; // AED 1,000.00
  const a = await makeBranch(p);
  const b = await makeBranch(p);
  const cat = await makeCategory(p, depositFils);
  await p.query(`insert into pricing_rules (name, category_id, daily_rate_fils) values ('base', $1, $2)`, [cat.id, dailyRateFils]);
  const v = await makeVehicle(p, a.id, cat.id);
  const ex = async (code: string, type: "PER_DAY" | "PER_RENTAL", price: number, cap: number | null, maxQ = 1) => {
    const c = `${code}_${randomUUID().slice(0, 6).toUpperCase()}`;
    const { rows } = await p.query<{ id: string }>(
      `insert into extras (code, name, charge_type, price_fils, max_charge_fils, max_quantity) values ($1,$1,$2,$3,$4,$5) returning id`,
      [c, type, price, cap, maxQ],
    );
    return rows[0].id;
  };
  return {
    branchA: a.id,
    branchB: b.id,
    categoryId: cat.id,
    vehicleId: v.id,
    depositFils,
    dailyRateFils,
    customer: await makeActor("CUSTOMER"),
    other: await makeActor("CUSTOMER"),
    admin: await makeActor("ADMIN"),
    extras: {
      GPS: await ex("GPS", "PER_DAY", 2500, 15000), // AED 25/day, capped AED 150
      CHILD_SEAT: await ex("CHILD_SEAT", "PER_DAY", 2000, null, 3),
      FULL_INS: await ex("FULL_INS", "PER_RENTAL", 9900, null),
    },
  };
}

/** A future UTC instant N days from now at hh:00 Asia/Dubai (UTC+4). */
export function dubai(daysFromNow: number, hour = 10): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(hour - 4, 0, 0, 0);
  return d;
}

export const newKey = () => randomUUID();
