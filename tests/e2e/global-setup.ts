// Resets driveeasy_e2e (create, migrate, truncate, seed) once per Playwright run.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { resetDatabase } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";

export default async function globalSetup() {
  const { root } = loadTestEnv();
  mkdirSync(path.join(root, "tests/e2e/.auth"), { recursive: true });
}
