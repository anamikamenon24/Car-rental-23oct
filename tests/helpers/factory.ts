// Minimal raw-SQL fixtures for DB-level tests (independent of the service layer).
import { randomUUID } from "node:crypto";
import type { Client, Pool, PoolClient } from "pg";

type Q = Pick<Client | Pool | PoolClient, "query">;

const rand = () => randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
const vin = () => Array.from({ length: 17 }, () => VIN_CHARS[Math.floor(Math.random() * VIN_CHARS.length)]).join("");

export async function makeUser(q: Q, over: { role?: "CUSTOMER" | "ADMIN"; email?: string } = {}) {
  const email = over.email ?? `u-${rand().toLowerCase()}@test.driveeasy.ae`;
  const { rows } = await q.query<{ id: string }>(
    `insert into users (name, email, role) values ($1, $2, $3) returning id`,
    ["Test User", email, over.role ?? "CUSTOMER"],
  );
  return { id: rows[0].id, email };
}

export async function makeBranch(q: Q) {
  const code = `T${rand().slice(0, 6)}`;
  const { rows } = await q.query<{ id: string }>(
    `insert into branches (code, slug, name, city, address) values ($1, $2, $3, 'Dubai', 'Test St') returning id`,
    [code, code.toLowerCase(), `Branch ${code}`],
  );
  return { id: rows[0].id, code };
}

export async function makeCategory(q: Q, depositFils = 100000) {
  const code = `C${rand().slice(0, 6)}`;
  const { rows } = await q.query<{ id: string }>(
    `insert into vehicle_categories (code, slug, name, deposit_fils) values ($1, $2, $3, $4) returning id`,
    [code, code.toLowerCase(), `Cat ${code}`, depositFils],
  );
  return { id: rows[0].id };
}

export async function makeVehicle(q: Q, branchId?: string, categoryId?: string) {
  branchId ??= (await makeBranch(q)).id;
  categoryId ??= (await makeCategory(q)).id;
  const { rows } = await q.query<{ id: string }>(
    `insert into vehicles (category_id, branch_id, make, model, year, plate, vin, color, transmission, fuel_type, seats)
     values ($1, $2, 'Toyota', 'Yaris', 2025, $3, $4, 'White', 'AUTOMATIC', 'PETROL', 5) returning id`,
    [categoryId, branchId, `DXB-${rand()}`, vin()],
  );
  return { id: rows[0].id, branchId, categoryId };
}

export interface RawReservation {
  userId: string;
  vehicleId: string;
  branchId: string;
  pickupAt: Date;
  returnAt: Date;
  status?: string;
  holdExpiresAt?: Date | null;
}

/** Inserts a reservation row directly (bypasses services); throws on constraint violations. */
export async function insertReservation(q: Q, r: RawReservation) {
  const status = r.status ?? "CONFIRMED";
  const hold = r.holdExpiresAt === undefined ? (status === "PENDING" ? new Date(Date.now() + 15 * 60_000) : null) : r.holdExpiresAt;
  const { rows } = await q.query<{ id: string }>(
    `insert into reservations (reference, user_id, vehicle_id, pickup_branch_id, return_branch_id, pickup_at, return_at,
       status, hold_expires_at, idempotency_key, rental_days, daily_rate_fils, base_fils, subtotal_fils, vat_fils,
       total_fils, deposit_fils, price_breakdown)
     values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, 1, 10000, 10000, 10000, 500, 10500, 100000, '{}'::jsonb)
     returning id`,
    [`DE-${rand()}`, r.userId, r.vehicleId, r.branchId, r.pickupAt, r.returnAt, status, hold, randomUUID()],
  );
  return rows[0].id;
}

export const days = (n: number) => n * 24 * 60 * 60 * 1000;
export const at = (iso: string) => new Date(iso);
