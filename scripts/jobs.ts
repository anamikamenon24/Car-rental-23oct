// Local stand-in for a cloud scheduler.
//   pnpm jobs release-expired-holds            run once
//   pnpm jobs release-expired-holds --every 60 run every 60 seconds until Ctrl+C
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const [name, flag, seconds] = process.argv.slice(2);
  const { db, pool } = await import("@/db");
  const { isJobName, jobs, runJob } = await import("@/lib/services/jobs");

  if (!name || !isJobName(name)) {
    console.error(`Usage: pnpm jobs <name> [--every <seconds>]\nJobs: ${Object.keys(jobs).join(", ")}`);
    process.exit(1);
  }

  const runOnce = async () => {
    const result = await runJob(name, { db, now: new Date() });
    console.log(`[${new Date().toISOString()}] ${name}: ${result.summary}`);
  };

  if (flag !== "--every") {
    await runOnce();
    await pool.end();
    return;
  }

  const intervalMs = Number(seconds ?? process.env.JOBS_INTERVAL_SECONDS ?? 60) * 1000;
  await runOnce();
  setInterval(() => runOnce().catch((err) => console.error(err)), intervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
