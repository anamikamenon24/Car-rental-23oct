// Seeded test users, from the db agent's src/db/seed-users.ts. Values are never printed.
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadTestEnv } from "./env";

export interface Credentials {
  email: string;
  password: string;
}
export interface SeedUsers {
  admin: Credentials & { name?: string };
  customer: Credentials & { name?: string };
}

let cached: SeedUsers | undefined;

export async function seedUsers(): Promise<SeedUsers> {
  if (cached) return cached;
  const file = path.join(loadTestEnv().root, "src/db/seed-users.ts");
  if (!existsSync(file)) throw new Error("src/db/seed-users.ts does not exist yet");
  const mod = await import(pathToFileURL(file).href);
  const users = mod.SEED_USERS as SeedUsers | undefined;
  if (!users?.admin?.email || !users?.customer?.email) throw new Error("SEED_USERS is missing admin/customer");
  cached = users;
  return users;
}
