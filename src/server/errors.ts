// Typed domain errors shared by every service. Safe to import from tests and scripts.
import { ZodError } from "zod";

export const DOMAIN_ERROR_STATUS = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_STATE: 409,
  VEHICLE_UNAVAILABLE: 409,
  HOLD_EXPIRED: 410,
  PAYMENT_DECLINED: 402,
  PRICE_UNAVAILABLE: 422,
  DRIVER_PROFILE_REQUIRED: 422,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL: 500,
} as const;

export type DomainErrorCode = keyof typeof DOMAIN_ERROR_STATUS;

export interface SerializedDomainError {
  code: DomainErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

export class DomainError extends Error {
  readonly status: number;
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly options: { fieldErrors?: Record<string, string[]>; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "DomainError";
    this.status = DOMAIN_ERROR_STATUS[code];
  }

  get fieldErrors() {
    return this.options.fieldErrors;
  }

  get details() {
    return this.options.details;
  }

  toJSON(): SerializedDomainError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fieldErrors ? { fieldErrors: this.fieldErrors } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export const notFound = (what: string) => new DomainError("NOT_FOUND", `${what} not found`);
export const forbidden = (message = "You are not allowed to do that") => new DomainError("FORBIDDEN", message);
export const invalidState = (message: string, details?: Record<string, unknown>) =>
  new DomainError("INVALID_STATE", message, { details });
export const vehicleUnavailable = (cause?: unknown) =>
  new DomainError("VEHICLE_UNAVAILABLE", "This vehicle is not available for the selected dates", { cause });

export function isDomainError(err: unknown, code?: DomainErrorCode): err is DomainError {
  return err instanceof DomainError && (code === undefined || err.code === code);
}

/** Postgres error helpers (pg DatabaseError, possibly wrapped by drizzle in `cause`). */
export function pgErrorCode(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e; i++) {
    const c = (e as { constraint?: unknown }).constraint;
    if (typeof c === "string") return c;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const PG = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
  EXCLUSION_VIOLATION: "23P01",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK: "40P01",
} as const;

/** Converts Zod and common Postgres errors into DomainErrors; returns other errors unchanged. */
export function toDomainError(err: unknown): unknown {
  if (err instanceof DomainError) return err;
  if (err instanceof ZodError) return fromZod(err);
  switch (pgErrorCode(err)) {
    case PG.EXCLUSION_VIOLATION:
      return vehicleUnavailable(err);
    case PG.UNIQUE_VIOLATION:
      return new DomainError("CONFLICT", `A record with the same unique value already exists`, {
        cause: err,
        details: { constraint: pgConstraint(err) },
      });
    case PG.FOREIGN_KEY_VIOLATION:
      return new DomainError("CONFLICT", "This record is still referenced by other data or references a missing record", {
        cause: err,
        details: { constraint: pgConstraint(err) },
      });
    case PG.CHECK_VIOLATION:
    case PG.NOT_NULL_VIOLATION:
      return new DomainError("VALIDATION", "Some values are not allowed", {
        cause: err,
        details: { constraint: pgConstraint(err) },
      });
  }
  return err;
}

export function fromZod(err: ZodError): DomainError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return new DomainError("VALIDATION", "Please check the highlighted fields", { fieldErrors });
}

/** Parse with a Zod schema, throwing a VALIDATION DomainError with field errors. */
export function parseInput<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: ZodError } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw fromZod(result.error);
  return result.data;
}
