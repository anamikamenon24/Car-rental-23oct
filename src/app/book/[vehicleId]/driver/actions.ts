"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { runAction } from "@/server/action";
import { saveDriverProfile } from "@/server/profile";
import { createReservationHold } from "@/server/reservations";
import { driverFromForm } from "@/lib/ui/driver";
import { errorState, formValues, type FormState } from "@/lib/ui/form-state";
import { parseExtras } from "@/lib/ui/search-params";

/**
 * Saves the driver profile and places a time-limited hold on the car (PENDING reservation
 * priced by the server), then sends the customer to checkout.
 */
export async function startCheckoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = formValues(formData);
  const driver = driverFromForm(formData);

  if (!driver.licenceFrontKey) {
    return {
      status: "error",
      message: "Please upload a photo of the front of the driving licence.",
      fieldErrors: { licenceFrontKey: ["Upload the front of the licence"] },
      values,
    };
  }

  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : "";
  };

  const result = await runAction(async () => {
    const profile = await saveDriverProfile(user, {
      fullName: driver.fullName ?? "",
      phone: driver.phone ?? "",
      dateOfBirth: driver.dateOfBirth ?? "",
      nationality: driver.nationality,
      licenceNumber: driver.licenceNumber ?? "",
      licenceCountry: driver.licenceCountry ?? "",
      licenceIssuedOn: driver.licenceIssuedOn,
      licenceExpiresOn: driver.licenceExpiresOn ?? "",
      licenceFrontKey: driver.licenceFrontKey,
      licenceBackKey: driver.licenceBackKey,
    });
    return createReservationHold(user, {
      vehicleId: str("vehicleId"),
      pickupBranchId: str("pickupBranchId"),
      returnBranchId: str("returnBranchId"),
      pickupAt: str("pickupAt"),
      returnAt: str("returnAt"),
      extras: parseExtras({ extras: str("extras") }),
      idempotencyKey: str("idempotencyKey"),
      notes: str("notes") || undefined,
      driver: {
        fullName: profile.fullName,
        phone: profile.phone,
        dateOfBirth: profile.dateOfBirth,
        nationality: profile.nationality ?? undefined,
        licenceNumber: profile.licenceNumber,
        licenceCountry: profile.licenceCountry,
        licenceIssuedOn: profile.licenceIssuedOn ?? undefined,
        licenceExpiresOn: profile.licenceExpiresOn,
        licenceFrontKey: profile.licenceFrontKey ?? undefined,
        licenceBackKey: profile.licenceBackKey ?? undefined,
      },
    });
  });

  if (!result.ok) return errorState(result.error, values, "driver.");
  redirect(`/checkout/${result.data.reservationId}`);
}
