import "server-only";
import { DomainError } from "@/server/errors";

/**
 * Runs a service call from a Server Component. Domain errors (bad input, unavailable vehicle…)
 * come back as values so the page can explain them; anything else is rethrown to error.tsx.
 */
export async function attempt<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string; fieldErrors?: Record<string, string[] | undefined> } }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof DomainError) {
      return { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
    }
    throw e;
  }
}
