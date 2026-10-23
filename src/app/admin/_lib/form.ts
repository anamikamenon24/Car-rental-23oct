import "server-only";
import { refresh } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { runAction } from "@/server/action";
import { zonedLocalToUtc } from "@/lib/ui/datetime";
import { errorState, formValues, type FormState } from "@/lib/ui/form-state";

export const str = (fd: FormData, k: string): string => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

export const opt = (fd: FormData, k: string): string | undefined => str(fd, k) || undefined;

export const bool = (fd: FormData, k: string): boolean => fd.get(k) === "on" || fd.get(k) === "true";

/** "123.45" AED -> 12345 fils. Invalid input is passed through so the Zod schema reports it. */
export function aedToFils(value: string): number | string {
  if (value === "") return value;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : value;
}

export const optFils = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? undefined : aedToFils(v);
};

/** datetime-local in a branch zone -> ISO string, or the raw value so validation reports it. */
export function localToIso(value: string, timeZone: string): string {
  if (!value) return value;
  return zonedLocalToUtc(value, timeZone)?.toISOString() ?? value;
}

/**
 * Standard admin mutation: re-checks the admin session, runs the service, refreshes the page
 * data, and maps domain errors to inline field errors.
 */
export async function adminMutation<T>(
  formData: FormData,
  run: (actor: Awaited<ReturnType<typeof requireAdmin>>) => Promise<T>,
  opts: { success: string | ((data: T) => string); keepValues?: boolean } ,
): Promise<FormState> {
  const actor = await requireAdmin();
  const values = formValues(formData);
  const result = await runAction(() => run(actor));
  if (!result.ok) return errorState(result.error, values);
  refresh();
  return {
    status: "success",
    message: typeof opts.success === "function" ? opts.success(result.data) : opts.success,
    values: opts.keepValues ? values : undefined,
  };
}
