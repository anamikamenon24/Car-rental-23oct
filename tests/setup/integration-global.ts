// Vitest globalSetup for the integration project: prepare driveeasy_test once per run.
import { ensureDatabase, migrateDatabase } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";

export default async function setup() {
  const { testUrl } = loadTestEnv();
  await ensureDatabase(testUrl);
  await migrateDatabase(testUrl);
}
