import type { JobContext, JobResult } from ".";

/** Job wrapper around the domain service (src/server/holds.ts). */
export async function releaseExpiredHolds({ now }: JobContext): Promise<JobResult> {
  const { releaseExpiredHolds: release } = await import("@/server/holds");
  const result = await release({ now });
  return {
    count: result.count,
    summary: `Released ${result.count} expired hold(s); settled money for ${result.settled} booking(s)`,
  };
}
