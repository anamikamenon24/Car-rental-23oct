"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { runAction } from "@/server/action";
import { cancelPendingReservation, payReservation } from "@/server/reservations";
import { errorState, type FormState } from "@/lib/ui/form-state";

export type PayState = FormState & { canRetry?: boolean };

/** Charges the rental total and pre-authorises the deposit with the chosen (test) method. */
export async function payAction(_prev: PayState, formData: FormData): Promise<PayState> {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");

  const result = await runAction(() => payReservation(user, { reservationId, paymentMethod, idempotencyKey }));
  if (!result.ok) {
    return { ...errorState(result.error), canRetry: result.error.code === "PAYMENT_DECLINED" };
  }
  const outcome = result.data;
  if (outcome.reservationStatus === "CONFIRMED") {
    redirect(`/account/rentals/${reservationId}/voucher?paid=1`);
  }
  const cancelled = outcome.paymentStatus === "CANCELED";
  return {
    status: "error",
    code: cancelled ? "PAYMENT_CANCELED" : "PAYMENT_DECLINED",
    message:
      outcome.failureReason ??
      (cancelled ? "The payment was cancelled before it completed." : "Your payment was declined."),
    canRetry: outcome.canRetry,
  };
}

/** Abandons checkout: releases the hold (and any authorised money) and goes back to the car. */
export async function cancelCheckoutAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId") ?? "");
  const vehicleId = String(formData.get("vehicleId") ?? "");
  const result = await runAction(() => cancelPendingReservation(user, reservationId));
  if (!result.ok && result.error.code !== "INVALID_STATE") {
    redirect(`/checkout/${reservationId}?cancelError=1`);
  }
  redirect(vehicleId ? `/vehicles/${vehicleId}?cancelled=1` : "/search");
}
