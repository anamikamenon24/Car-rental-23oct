import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { releaseExpiredHolds } from "@/server/holds";
import { log } from "@/server/log";

/**
 * Vercel Cron target (see vercel.json). Requires `Authorization: Bearer ${CRON_SECRET}`.
 * Idempotent: running it twice releases nothing the second time.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request.headers.get("authorization"))) {
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "Invalid cron secret" } }, { status: 401 });
  }
  try {
    const result = await releaseExpiredHolds({ now: new Date() });
    return Response.json({ ok: true, released: result.count, reservationIds: result.reservationIds, settled: result.settled });
  } catch (err) {
    log.error("release-expired-holds failed", { err });
    return Response.json({ error: { code: "INTERNAL", message: "Job failed" } }, { status: 500 });
  }
}

function authorised(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
