// Seeded test logins. Values come from env (SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD,
// SEED_CUSTOMER_EMAIL, SEED_CUSTOMER_PASSWORD). Without env, passwords are derived from
// BETTER_AUTH_SECRET, so they are stable per environment but never committed. `pnpm db:seed`
// writes the effective values to the gitignored seed-users.local.md.
import { createHmac } from "node:crypto";

function derivedPassword(label: string): string {
  const secret = process.env.SEED_PASSWORD_SECRET || process.env.BETTER_AUTH_SECRET || "driveeasy-local-only";
  const h = createHmac("sha256", secret).update(`seed-password:${label}`).digest("base64url").slice(0, 14);
  return `De${h}!7`;
}

export interface SeedUser {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "CUSTOMER";
}

/** Read at access time (env can change between tests). */
export const SEED_USERS = {
  get admin(): SeedUser {
    return {
      name: "DriveEasy Admin",
      email: (process.env.SEED_ADMIN_EMAIL || "admin@driveeasy.test").toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD || derivedPassword("admin"),
      role: "ADMIN",
    };
  },
  get customer(): SeedUser {
    return {
      name: "Layla Customer",
      email: (process.env.SEED_CUSTOMER_EMAIL || "customer@driveeasy.test").toLowerCase(),
      password: process.env.SEED_CUSTOMER_PASSWORD || derivedPassword("customer"),
      role: "CUSTOMER",
    };
  },
};
