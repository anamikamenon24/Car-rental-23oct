"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/server/auth";
import { runAction } from "@/server/action";
import { cancelReservation, getMyReservation, modifyReservationDates, quoteDateChange } from "@/server/reservations";
import type { Quote } from "@/server/quotes";
import { zonedLocalToUtc } from "@/lib/ui/datetime";
import { errorState, formValues, type FormState } from "@/lib/ui/form-state";

export type DateChangeState = FormState & {
  preview?: {
    available: boolean;
    quote: Quote;
    currentTotalFils: number;
    differenceFils: number;
    pickupLocal: string;
    returnLocal: string;
  };
  done?: boolean;
};

/** Reads the new local times in each branch's zone (looked up server-side, not trusted from the form). */
async function readDates(formData: FormData) {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId") ?? "");
  const pickupLocal = String(formData.get("pickupAt") ?? "");
  const returnLocal = String(formData.get("returnAt") ?? "");
  const r = await getMyReservation(user, reservationId);
  const pickupAt = zonedLocalToUtc(pickupLocal, r.pickupBranch.timeZone);
  const returnAt = zonedLocalToUtc(returnLocal, r.returnBranch.timeZone);
  return { user, reservationId, pickupLocal, returnLocal, pickupAt, returnAt };
}

function badDates(pickupAt: Date | null, returnAt: Date | null, values: Record<string, string>): DateChangeState | null {
  const fieldErrors: Record<string, string[]> = {};
  if (!pickupAt) fieldErrors.pickupAt = ["Enter a valid pick-up date and time"];
  if (!returnAt) fieldErrors.returnAt = ["Enter a valid return date and time"];
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please check the new dates.", fieldErrors, values };
  }
  return null;
}

export async function previewDateChangeAction(_prev: DateChangeState, formData: FormData): Promise<DateChangeState> {
  const values = formValues(formData);
  const result = await runAction(async () => {
    const d = await readDates(formData);
    const invalid = badDates(d.pickupAt, d.returnAt, values);
    if (invalid) return { invalid };
    const q = await quoteDateChange(d.user, d.reservationId, { pickupAt: d.pickupAt!, returnAt: d.returnAt! });
    return { q, d };
  });
  if (!result.ok) return errorState(result.error, values);
  if ("invalid" in result.data) return result.data.invalid!;
  const { q, d } = result.data;
  if (!q.available) {
    return {
      status: "error",
      code: "VEHICLE_UNAVAILABLE",
      message: "The car isn't available for those dates. Try different times.",
      values,
    };
  }
  return {
    status: "success",
    values,
    preview: {
      available: q.available,
      quote: q.quote,
      currentTotalFils: q.currentTotalFils,
      differenceFils: q.differenceFils,
      pickupLocal: d.pickupLocal,
      returnLocal: d.returnLocal,
    },
  };
}

export async function confirmDateChangeAction(prev: DateChangeState, formData: FormData): Promise<DateChangeState> {
  const values = formValues(formData);
  const result = await runAction(async () => {
    const d = await readDates(formData);
    const invalid = badDates(d.pickupAt, d.returnAt, values);
    if (invalid) return { invalid };
    await modifyReservationDates(d.user, d.reservationId, {
      pickupAt: d.pickupAt!,
      returnAt: d.returnAt!,
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      paymentMethod: String(formData.get("paymentMethod") ?? "") || undefined,
    });
    return { ok: true as const };
  });
  if (!result.ok) return { ...errorState(result.error, values), preview: prev.preview };
  if ("invalid" in result.data) return result.data.invalid!;
  refresh();
  return { status: "success", done: true, message: "Your booking dates have been updated." };
}

export async function cancelRentalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const reservationId = String(formData.get("reservationId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || undefined;
  const result = await runAction(() => cancelReservation(user, reservationId, { reason }));
  if (!result.ok) return errorState(result.error);
  refresh();
  return { status: "success", message: "Your booking has been cancelled." };
}
