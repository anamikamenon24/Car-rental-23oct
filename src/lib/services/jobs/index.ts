import type { Db } from "@/db";
import { releaseExpiredHolds } from "./release-expired-holds";

// Scheduled jobs are plain functions. What triggers them is the swappable part:
// locally `pnpm jobs <name>` (optionally `--every <seconds>`); in the cloud, a cron
// service calling an HTTP route that checks CRON_SECRET and then calls runJob.

export interface JobContext {
  db: Db;
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
    description: "Release booking holds whose time limit has passed",
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
