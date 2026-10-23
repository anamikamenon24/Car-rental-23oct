"use client";

import { TextField } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import type { FieldErrors } from "@/lib/ui/form-state";

export type DriverDefaults = {
  fullName?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  licenceNumber?: string | null;
  licenceCountry?: string | null;
  licenceIssuedOn?: string | null;
  licenceExpiresOn?: string | null;
  licenceFrontKey?: string | null;
  licenceFrontUrl?: string | null;
  licenceBackKey?: string | null;
  licenceBackUrl?: string | null;
};

/**
 * Driver + licence inputs. Field names match driverProfileSchema; values echo the last submit
 * so a failed server validation doesn't wipe the form.
 */
export function DriverFields({
  defaults,
  values,
  errors,
}: {
  defaults: DriverDefaults;
  values?: Record<string, string>;
  errors?: FieldErrors;
}) {
  const v = (k: keyof DriverDefaults) => values?.[k] ?? (defaults[k] as string | null | undefined) ?? "";
  const e = (k: string) => errors?.[k];

  return (
    <div className="space-y-5">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold text-ink-900">Main driver</legend>
        <TextField
          label="Full name (as on licence)"
          name="fullName"
          id="driver-full-name"
          data-testid="driver-full-name"
          autoComplete="name"
          required
          defaultValue={v("fullName")}
          error={e("fullName")}
          wrapperClassName="sm:col-span-2"
        />
        <TextField
          label="Mobile phone"
          name="phone"
          id="driver-phone"
          data-testid="driver-phone"
          type="tel"
          autoComplete="tel"
          placeholder="+971 50 123 4567"
          required
          defaultValue={v("phone")}
          error={e("phone")}
        />
        <TextField
          label="Date of birth"
          name="dateOfBirth"
          id="driver-dob"
          data-testid="driver-dob"
          type="date"
          autoComplete="bday"
          required
          defaultValue={v("dateOfBirth")}
          error={e("dateOfBirth")}
          hint="Drivers must be 21 or older."
        />
        <TextField
          label="Nationality"
          name="nationality"
          id="driver-nationality"
          data-testid="driver-nationality"
          autoComplete="country-name"
          defaultValue={v("nationality")}
          error={e("nationality")}
        />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold text-ink-900">Driving licence</legend>
        <TextField
          label="Licence number"
          name="licenceNumber"
          id="driver-licence-number"
          data-testid="driver-licence-number"
          required
          defaultValue={v("licenceNumber")}
          error={e("licenceNumber")}
        />
        <TextField
          label="Issuing country"
          name="licenceCountry"
          id="driver-licence-country"
          data-testid="driver-licence-country"
          required
          maxLength={2}
          placeholder="AE"
          className="uppercase"
          defaultValue={v("licenceCountry")}
          error={e("licenceCountry")}
          hint="2-letter code, e.g. AE, GB, IN."
        />
        <TextField
          label="Issued on"
          name="licenceIssuedOn"
          id="driver-licence-issued"
          data-testid="driver-licence-issued"
          type="date"
          defaultValue={v("licenceIssuedOn")}
          error={e("licenceIssuedOn")}
        />
        <TextField
          label="Expires on"
          name="licenceExpiresOn"
          id="driver-licence-expires"
          data-testid="driver-licence-expires"
          type="date"
          required
          defaultValue={v("licenceExpiresOn")}
          error={e("licenceExpiresOn")}
        />
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
          <FileUpload
            label="Licence photo (front)"
            endpoint="/api/uploads/licence?side=front"
            name="licenceFrontKey"
            testId="licence-upload"
            required
            existing={
              defaults.licenceFrontKey && defaults.licenceFrontUrl
                ? { key: defaults.licenceFrontKey, url: defaults.licenceFrontUrl, label: "Front on file" }
                : null
            }
            hint="JPEG, PNG, WebP or PDF up to 8 MB. Stored privately."
            error={e("licenceFrontKey")}
          />
          <FileUpload
            label="Licence photo (back)"
            endpoint="/api/uploads/licence?side=back"
            name="licenceBackKey"
            testId="licence-upload-back"
            existing={
              defaults.licenceBackKey && defaults.licenceBackUrl
                ? { key: defaults.licenceBackKey, url: defaults.licenceBackUrl, label: "Back on file" }
                : null
            }
            hint="Optional."
            error={e("licenceBackKey")}
          />
        </div>
      </fieldset>
    </div>
  );
}

