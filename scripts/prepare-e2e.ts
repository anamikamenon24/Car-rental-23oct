import { resetDatabase } from "../tests/helpers/db";
import { loadTestEnv } from "../tests/helpers/env";

async function main() {
  const { e2eUrl } = loadTestEnv();
  await resetDatabase(e2eUrl);
  console.log("driveeasy_e2e database prepared and seeded.");
}

main().catch((err) => {
  console.error("Failed to prepare e2e database:", err);
  process.exit(1);
});
