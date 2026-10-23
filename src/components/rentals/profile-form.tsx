"use client";

import { useActionState } from "react";
import { DriverFields, type DriverDefaults } from "@/components/booking/driver-fields";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/field";
import { initialFormState, type FormState } from "@/lib/ui/form-state";

export function ProfileForm({
  defaults,
  action,
}: {
  defaults: DriverDefaults;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-6" aria-label="Driver profile" noValidate>
      <FormMessage state={state} />
      <DriverFields defaults={defaults} values={state.values} errors={state.fieldErrors} />
      <SubmitButton pending={pending} pendingLabel="Saving…" data-testid="profile-save">
        Save driver details
      </SubmitButton>
    </form>
  );
}
