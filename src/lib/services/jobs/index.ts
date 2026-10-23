import type { Db } from "@/db";
import { releaseExpiredHolds } from "./release-expired-holds";

// Scheduled jobs are plain functions. What triggers them is the swappable part:
// locally `pnpm jobs <name>` (optionally `--every <seconds>`); on Vercel, the cron in vercel.json
// calls GET /api/cron/<name> with `Authorization: Bearer $CRON_SECRET`.

export interface JobContext {
  db?: Db;
  now: Date;
}

export interface JobResult {
  summary: string;
  count: number;
}

export interface Job {
  description: string;
  run(ctx: JobContext): Promise<JobResult>;
}

export const jobs = {
  "release-expired-holds": {
    description: "Expire PENDING reservations whose hold has passed and return any money attached to them",
    run: releaseExpiredHolds,
  },
} satisfies Record<string, Job>;

export type JobName = keyof typeof jobs;

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobs, name);
}

export function runJob(name: JobName, ctx: JobContext): Promise<JobResult> {
  return jobs[name].run(ctx);
}
