// Driver form field names (match driverProfileSchema in @/server/validation).
export const DRIVER_FIELD_NAMES = [
  "fullName",
  "phone",
  "dateOfBirth",
  "nationality",
  "licenceNumber",
  "licenceCountry",
  "licenceIssuedOn",
  "licenceExpiresOn",
  "licenceFrontKey",
  "licenceBackKey",
] as const;

/** Picks the driver fields out of a form submission (empty strings become undefined). */
export function driverFromForm(formData: FormData): Record<(typeof DRIVER_FIELD_NAMES)[number], string | undefined> {
  const out = {} as Record<(typeof DRIVER_FIELD_NAMES)[number], string | undefined>;
  for (const name of DRIVER_FIELD_NAMES) {
    const v = formData.get(name);
    out[name] = typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
  }
  return out;
}
