"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextareaField } from "@/components/ui/field";
import { formatAED } from "@/lib/ui/format";
import { initialFormState, type FormState } from "@/lib/ui/form-state";

/** Shows the policy and the server-calculated refund, and asks for confirmation before cancelling. */
export function CancelPanel({
  reservationId,
  refundFils,
  feeFils,
  refundPercent,
  reason,
  policy,
  action,
}: {
  reservationId: string;
  refundFils: number;
  feeFils: number;
  refundPercent: number;
  reason: string;
  policy: readonly string[];
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialFormState);

  if (state.status === "success") {
    return (
      <Alert tone="success" title="Booking cancelled" data-testid="cancel-success">
        {state.message} {refundFils > 0 ? `A refund of ${formatAED(refundFils)} is on its way to your card.` : ""}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-ink-50 p-4 text-sm">
        <p className="font-semibold text-ink-900">Cancellation policy</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-700">
          {policy.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-ink-800">
          If you cancel now: <span className="font-semibold">{reason}</span>
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <dt className="text-ink-500">Refund ({refundPercent}%)</dt>
            <dd className="text-lg font-bold text-emerald-700" data-testid="refund-amount">
              {formatAED(refundFils)}
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Cancellation fee</dt>
            <dd className="text-lg font-bold text-ink-900" data-testid="cancellation-fee">
              {formatAED(feeFils)}
            </dd>
          </div>
        </dl>
      </div>

      {!confirming ? (
        <Button variant="outline" className="text-red-700" onClick={() => setConfirming(true)} data-testid="cancel-reservation">
          Cancel this booking
        </Button>
      ) : (
        <form action={formAction} className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-4">
          <input type="hidden" name="reservationId" value={reservationId} />
          <p className="text-sm font-medium text-red-900" id="cancel-confirm-text">
            Cancel this booking and receive {formatAED(refundFils)} back? This can&apos;t be undone.
          </p>
          <TextareaField label="Reason (optional)" name="reason" id="cancel-reason" rows={2} maxLength={500} />
          {state.status === "error" ? (
            <Alert tone="error" data-testid="cancel-error">
              {state.message}
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <SubmitButton
              variant="danger"
              pending={pending}
              pendingLabel="Cancelling…"
              data-testid="cancel-confirm"
              aria-describedby="cancel-confirm-text"
            >
              Yes, cancel booking
            </SubmitButton>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep booking
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
