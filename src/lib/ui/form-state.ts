// Shape returned by every form server action used with useActionState.

export type FieldErrors = Record<string, string[] | undefined>;

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  /** Domain error code (e.g. VEHICLE_UNAVAILABLE, HOLD_EXPIRED) for special UI. */
  code?: string;
  fieldErrors?: FieldErrors;
  /** Echo of submitted values so inputs keep their content after a failed submit. */
  values?: Record<string, string>;
};

export const initialFormState: FormState = { status: "idle" };

/** String values of a FormData (files excluded), for echoing back into inputs. */
export function formValues(formData: FormData, omit: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || omit.includes(key)) continue;
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Converts a Zod 4 error's issues into { field: [messages] }. */
export function zodFieldErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Builds an error FormState from a service error, stripping a nested prefix like "driver.". */
export function errorState(
  error: { code: string; message: string; fieldErrors?: Record<string, string[]> },
  values?: Record<string, string>,
  stripPrefix?: string,
): FormState {
  let fieldErrors: FieldErrors | undefined;
  if (error.fieldErrors) {
    fieldErrors = {};
    for (const [k, v] of Object.entries(error.fieldErrors)) {
      const key = stripPrefix && k.startsWith(stripPrefix) ? k.slice(stripPrefix.length) : k;
      fieldErrors[key] = v;
    }
  }
  return { status: "error", code: error.code, message: error.message, fieldErrors, values };
}
