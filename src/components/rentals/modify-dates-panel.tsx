"use client";

import { useActionState, useState } from "react";
import { PAYMENT_TEST_METHODS } from "@/lib/constants";
import { TextField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { formatAED } from "@/lib/ui/format";
import { initialFormState } from "@/lib/ui/form-state";
import type { DateChangeState } from "@/app/account/rentals/[id]/actions";

type Action = (prev: DateChangeState, fd: FormData) => Promise<DateChangeState>;

/** Two-step date change: preview the server re-price, then confirm (paying or refunding the difference). */
export function ModifyDatesPanel({
  reservationId,
  currentPickup,
  currentReturn,
  pickupCity,
  returnCity,
  previewAction,
  confirmAction,
  initialKey,
}: {
  reservationId: string;
  currentPickup: string;
  currentReturn: string;
  pickupCity: string;
  returnCity: string;
  previewAction: Action;
  confirmAction: Action;
  initialKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [preview, previewFormAction, previewPending] = useActionState(previewAction, initialFormState as DateChangeState);
  const [confirm, confirmFormAction, confirmPending] = useActionState(confirmAction, initialFormState as DateChangeState);

  if (confirm.done) {
    return (
      <Alert tone="success" data-testid="modify-success" title="Dates updated">
        {confirm.message}
      </Alert>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="modify-dates-open">
        Change dates
      </Button>
    );
  }

  const p = preview.status === "success" ? preview.preview : undefined;
  const values = preview.values;

  return (
    <div className="space-y-4">
      <form action={previewFormAction} className="space-y-4" aria-label="New rental dates" noValidate>
        <input type="hidden" name="reservationId" value={reservationId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="New pick-up"
            name="pickupAt"
            id="modify-pickup-at"
            data-testid="modify-pickup-at"
            type="datetime-local"
            step={1800}
            required
            defaultValue={values?.pickupAt ?? currentPickup}
            hint={`${pickupCity} local time`}
            error={preview.fieldErrors?.pickupAt}
          />
          <TextField
            label="New return"
            name="returnAt"
            id="modify-return-at"
            data-testid="modify-return-at"
            type="datetime-local"
            step={1800}
            required
            defaultValue={values?.returnAt ?? currentReturn}
            hint={`${returnCity} local time`}
            error={preview.fieldErrors?.returnAt}
          />
        </div>
        {preview.status === "error" && preview.message ? (
          <Alert tone="error" data-testid="modify-error">
            {preview.message}
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="secondary" pending={previewPending} data-testid="modify-dates-preview">
            Check new price
          </SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Keep current dates
          </Button>
        </div>
      </form>

      {p ? (
        <form action={confirmFormAction} className="space-y-4 rounded-xl border border-ink-200 p-4" aria-label="Confirm date change">
          <input type="hidden" name="reservationId" value={reservationId} />
          <input type="hidden" name="pickupAt" value={p.pickupLocal} />
          <input type="hidden" name="returnAt" value={p.returnLocal} />
          <input type="hidden" name="idempotencyKey" value={`${initialKey}-${p.pickupLocal}-${p.returnLocal}`} />
          <PriceBreakdown quote={p.quote} title="New price" showDeposit={false} />
          <div className="rounded-xl bg-ink-50 p-3 text-sm" data-testid="modify-difference">
            Currently paid {formatAED(p.currentTotalFils)} ·{" "}
            {p.differenceFils > 0 ? (
              <strong>You pay {formatAED(p.differenceFils)} more</strong>
            ) : p.differenceFils < 0 ? (
              <strong>We refund {formatAED(-p.differenceFils)}</strong>
            ) : (
              <strong>No price change</strong>
            )}
          </div>
          {p.differenceFils > 0 ? (
            <SelectField
              label="TEST MODE payment method for the difference"
              name="paymentMethod"
              id="modify-payment-method"
              data-testid="modify-payment-method"
              defaultValue={PAYMENT_TEST_METHODS[0].token}
            >
              {PAYMENT_TEST_METHODS.map((m) => (
                <option key={m.token} value={m.token}>
                  {m.label}
                </option>
              ))}
            </SelectField>
          ) : null}
          {confirm.status === "error" && confirm.message ? (
            <Alert tone="error" data-testid="modify-error">
              {confirm.message}
            </Alert>
          ) : null}
          <SubmitButton pending={confirmPending} data-testid="modify-dates-submit" pendingLabel="Updating…">
            Confirm new dates
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
