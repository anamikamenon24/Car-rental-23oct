import "server-only";
import { unstable_rethrow } from "next/navigation";
import { DomainError, toDomainError, type SerializedDomainError } from "./errors";
import { log } from "./log";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: SerializedDomainError };

/**
 * Runs a server action body and returns a serialisable result instead of throwing.
 * Next.js redacts thrown errors in production, so typed errors must be returned.
 * redirect()/notFound() and other Next control-flow errors are rethrown.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, error: toErrorResult(err) };
  }
}

export function toErrorResult(err: unknown): SerializedDomainError {
  const mapped = toDomainError(err);
  if (mapped instanceof DomainError) return mapped.toJSON();
  log.error("Unexpected error", { err });
  return { code: "INTERNAL", message: "Something went wrong. Please try again." };
}

/** JSON error response for route handlers. */
export function errorResponse(err: unknown): Response {
  const mapped = toDomainError(err);
  if (mapped instanceof DomainError) return Response.json({ error: mapped.toJSON() }, { status: mapped.status });
  log.error("Unexpected error in route handler", { err });
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500 });
}
