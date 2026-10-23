"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/server/auth";
import { runAction } from "@/server/action";
import { saveDriverProfile } from "@/server/profile";
import { driverFromForm } from "@/lib/ui/driver";
import { errorState, formValues, type FormState } from "@/lib/ui/form-state";

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/account/profile");
  const values = formValues(formData);
  const d = driverFromForm(formData);
  const result = await runAction(() =>
    saveDriverProfile(user, {
      fullName: d.fullName ?? "",
      phone: d.phone ?? "",
      dateOfBirth: d.dateOfBirth ?? "",
      nationality: d.nationality,
      licenceNumber: d.licenceNumber ?? "",
      licenceCountry: d.licenceCountry ?? "",
      licenceIssuedOn: d.licenceIssuedOn,
      licenceExpiresOn: d.licenceExpiresOn ?? "",
      licenceFrontKey: d.licenceFrontKey,
      licenceBackKey: d.licenceBackKey,
    }),
  );
  if (!result.ok) return errorState(result.error, values);
  refresh();
  return { status: "success", message: "Driver details saved.", values };
}
