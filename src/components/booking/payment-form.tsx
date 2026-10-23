"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useState } from "react";
import { PAYMENT_TEST_METHODS } from "@/lib/constants";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/field";
import { HoldCountdown } from "./hold-countdown";
import { initialFormState } from "@/lib/ui/form-state";
import type { PayState } from "@/app/checkout/[reservationId]/actions";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Test-mode checkout. Each attempt gets its own idempotency key: a double click re-sends the
 * same key (no double charge) while "Try again" after a decline uses a fresh one.
 */
export function PaymentForm({
  reservationId,
  vehicleId,
  holdExpiresAt,
  totalLabel,
  depositLabel,
  initialKey,
  payAction,
  cancelAction,
  searchHref,
}: {
  reservationId: string;
  vehicleId: string;
  holdExpiresAt: string;
  totalLabel: string;
  depositLabel: string;
  initialKey: string;
  payAction: (prev: PayState, fd: FormData) => Promise<PayState>;
  cancelAction: (fd: FormData) => Promise<void>;
  searchHref: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(payAction, initialFormState as PayState);
  const [key, setKey] = useState(initialKey);
  const [expired, setExpired] = useState(() => new Date(holdExpiresAt).getTime() <= Date.now());
  const [lastState, setLastState] = useState(state);

  // A finished attempt (declined / cancelled / error) means the next submit is a new attempt.
  if (state !== lastState) {
    setLastState(state);
    if (state.status === "error") setKey(newKey());
  }

  const onExpire = useCallback(() => {
    setExpired(true);
    router.refresh();
  }, [router]);

  const holdGone = expired || state.code === "HOLD_EXPIRED";
  const unavailable = state.code === "VEHICLE_UNAVAILABLE";
  const declined = state.code === "PAYMENT_DECLINED" || state.code === "PAYMENT_CANCELED";
  const blocked = holdGone || unavailable;

  return (
    <div className="space-y-4">
      <HoldCountdown expiresAt={holdExpiresAt} onExpire={onExpire} />

      {state.status === "error" && declined ? (
        <Alert
          tone="error"
          data-testid="payment-error"
          title={state.code === "PAYMENT_CANCELED" ? "Payment cancelled" : "Payment declined"}
          action={
            state.canRetry !== false && !blocked ? (
              <button
                type="submit"
                form="payment-form"
                data-testid="payment-retry"
                disabled={pending}
                className={buttonClasses("primary", "sm")}
              >
                Try again
              </button>
            ) : undefined
          }
        >
          {state.message} No money was taken.{" "}
          {state.canRetry !== false && !blocked ? "You can try again or use a different method." : ""}
        </Alert>
      ) : null}
      {state.status === "error" && unavailable ? (
        <Alert
          tone="error"
          data-testid="vehicle-unavailable"
          title="This car is no longer available"
          action={
            <Link href={searchHref} className={buttonClasses("primary", "sm")}>
              Find another car
            </Link>
          }
        >
          The car was booked by someone else before payment completed. You have not been charged.
        </Alert>
      ) : null}
      {holdGone ? (
        <Alert
          tone="warning"
          data-testid="hold-expired"
          title="Your hold has expired"
          action={
            <Link href={`/vehicles/${vehicleId}`} className={buttonClasses("primary", "sm")}>
              Start again
            </Link>
          }
        >
          We released the car because payment wasn&apos;t completed in time. You have not been charged.
        </Alert>
      ) : null}
      {state.status === "error" && !declined && !unavailable && state.code !== "HOLD_EXPIRED" ? (
        <Alert tone="error" data-testid="payment-error">
          {state.message}
        </Alert>
      ) : null}

      <form id="payment-form" action={formAction} className="space-y-4" aria-label="Payment">
        <input type="hidden" name="reservationId" value={reservationId} />
        <input type="hidden" name="idempotencyKey" value={key} />

        <div className="rounded-xl border-2 border-dashed border-accent-400 bg-accent-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-accent-700">
            <span className="rounded bg-accent-400 px-1.5 py-0.5 text-xs text-ink-900" data-testid="test-mode-badge">
              TEST MODE
            </span>
            No real card is charged
          </p>
          <label htmlFor="payment-method" className="mt-3 block text-sm font-medium text-ink-800">
            Test payment method
          </label>
          <select
            id="payment-method"
            data-testid="payment-method"
            name="paymentMethod"
            defaultValue={PAYMENT_TEST_METHODS[0].token}
            disabled={blocked || pending}
            className={`${inputClasses} mt-1.5`}
          >
            {PAYMENT_TEST_METHODS.map((m) => (
              <option key={m.token} value={m.token}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-ink-600">
            You will be charged <strong>{totalLabel}</strong> and a refundable deposit of{" "}
            <strong>{depositLabel}</strong> will be held on the card.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton
            size="lg"
            variant="accent"
            disabled={blocked}
            pending={pending}
            pendingLabel="Processing payment…"
            data-testid="pay-submit"
          >
            Pay {totalLabel}
          </SubmitButton>
        </div>
      </form>

      <form action={cancelAction}>
        <input type="hidden" name="reservationId" value={reservationId} />
        <input type="hidden" name="vehicleId" value={vehicleId} />
        <SubmitButton variant="ghost" size="sm" data-testid="checkout-cancel" disabled={pending}>
          Cancel booking and release the car
        </SubmitButton>
      </form>
    </div>
  );
}
