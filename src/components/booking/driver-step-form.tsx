"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DriverFields, type DriverDefaults } from "./driver-fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { TextareaField } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { initialFormState, type FormState } from "@/lib/ui/form-state";

type Hidden = {
  vehicleId: string;
  pickupBranchId: string;
  returnBranchId: string;
  pickupAt: string; // ISO UTC
  returnAt: string; // ISO UTC
  extras: string;
  idempotencyKey: string;
};

export function DriverStepForm({
  action,
  hidden,
  defaults,
  backHref,
  searchHref,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  hidden: Hidden;
  defaults: DriverDefaults;
  backHref: string;
  searchHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const unavailable = state.code === "VEHICLE_UNAVAILABLE";

  return (
    <form action={formAction} className="space-y-6" aria-label="Driver details" noValidate>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {state.status === "error" ? (
        <Alert
          tone="error"
          data-testid={unavailable ? "vehicle-unavailable" : "driver-form-error"}
          title={unavailable ? "This car is no longer available" : "Please check your details"}
          action={
            unavailable ? (
              <div className="flex flex-wrap gap-2">
                <Link href={backHref} className={buttonClasses("primary", "sm")}>
                  Change dates
                </Link>
                <Link href={searchHref} className={buttonClasses("outline", "sm")}>
                  See other cars
                </Link>
              </div>
            ) : undefined
          }
        >
          {unavailable
            ? "Someone else just booked this car for overlapping dates. Your card has not been charged."
            : state.message}
        </Alert>
      ) : null}

      <DriverFields defaults={defaults} values={state.values} errors={state.fieldErrors} />

      <TextareaField
        label="Notes for the branch (optional)"
        name="notes"
        id="booking-notes"
        maxLength={500}
        rows={3}
        defaultValue={state.values?.notes ?? ""}
        error={state.fieldErrors?.notes}
      />

      <p className="text-xs text-ink-500">
        By continuing we hold this car for you for a few minutes while you pay. Your licence images are stored
        privately and only shown to you and DriveEasy staff.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="lg" data-testid="book-continue" pending={pending} pendingLabel="Reserving your car…">
          Reserve and continue to payment
        </SubmitButton>
        <Link href={backHref} className={buttonClasses("ghost", "lg")}>
          Back
        </Link>
      </div>
    </form>
  );
}
