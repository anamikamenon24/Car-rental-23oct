"use server";

import { refresh } from "next/cache";
import { requireAdmin } from "@/server/auth";
import { runAction } from "@/server/action";
import { adminCancelReservation, adminGetReservation } from "@/server/admin/reservations";
import { checkIn, checkOut, quoteCheckIn, type CheckInQuote } from "@/server/admin/operations";
import { createDamageReport } from "@/server/admin/damage";
import { errorState, formValues, type FormState } from "@/lib/ui/form-state";
import { adminMutation, bool, localToIso, opt, optFils, str } from "../../_lib/form";

export async function checkOutAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "reservationId");
  return adminMutation(
    fd,
    (actor) => checkOut(actor, id, { mileageKm: str(fd, "mileageKm"), fuelEighths: str(fd, "fuelEighths"), notes: opt(fd, "notes") }),
    { success: (a) => `Car checked out. Agreement ${a.agreementNumber} created.` },
  );
}

export type CheckInSummary = {
  lateMinutes: number;
  lateFeeFils: number;
  fuelChargeFils: number;
  damageChargeFils: number;
  vatFils: number;
  totalFils: number;
  depositFils: number;
  depositCaptureFils: number;
  depositReleaseFils: number;
  balanceDueFils: number;
};

export type CheckInState = FormState & { summary?: CheckInSummary; completed?: boolean };

function fromQuote(q: CheckInQuote): CheckInSummary {
  return {
    lateMinutes: q.lateMinutes,
    lateFeeFils: q.lateFeeFils,
    fuelChargeFils: q.fuelChargeFils,
    damageChargeFils: q.damageChargeFils,
    vatFils: q.vatFils,
    totalFils: q.totalFils,
    depositFils: q.depositFils,
    depositCaptureFils: q.depositCaptureFils,
    depositReleaseFils: q.depositReleaseFils,
    balanceDueFils: q.balanceDueFils,
  };
}

/** intent=preview → server-calculated charges; intent=complete → records the return and settles the deposit. */
export async function checkInAction(_prev: CheckInState, fd: FormData): Promise<CheckInState> {
  const actor = await requireAdmin();
  const values = formValues(fd);
  const id = str(fd, "reservationId");
  const tz = str(fd, "timeZone") || "Asia/Dubai";
  const input = {
    returnedAt: str(fd, "returnedAt") ? localToIso(str(fd, "returnedAt"), tz) : undefined,
    mileageKm: str(fd, "mileageKm"),
    fuelEighths: str(fd, "fuelEighths"),
    chargeFuel: bool(fd, "chargeFuel"),
    damageChargeFils: optFils(fd, "damageChargeFils"),
  };

  if (str(fd, "intent") !== "complete") {
    const q = await runAction(() => quoteCheckIn(actor, id, input));
    if (!q.ok) return errorState(q.error, values);
    return { status: "idle", values, summary: fromQuote(q.data) };
  }

  const result = await runAction(async () => {
    await checkIn(actor, id, {
      ...input,
      returnBranchId: opt(fd, "returnBranchId"),
      notes: opt(fd, "notes"),
      depositAction: (opt(fd, "depositAction") as "AUTO" | "RELEASE" | "CAPTURE" | undefined) ?? "AUTO",
      captureFils: optFils(fd, "captureFils"),
    });
    return adminGetReservation(actor, id);
  });
  if (!result.ok) return errorState(result.error, values);
  const r = result.data;
  const a = r.agreement!;
  refresh();
  return {
    status: "success",
    completed: true,
    message: `Car checked in. ${a.balanceDueFils > 0 ? "A balance is due from the customer." : "Deposit settled."}`,
    summary: {
      lateMinutes: a.lateMinutes,
      lateFeeFils: a.lateFeeFils,
      fuelChargeFils: a.fuelChargeFils,
      damageChargeFils: a.damageChargeFils,
      vatFils: a.additionalVatFils,
      totalFils: a.additionalTotalFils,
      depositFils: r.depositFils,
      depositCaptureFils: a.depositCapturedFils,
      depositReleaseFils: Math.max(0, r.depositFils - a.depositCapturedFils),
      balanceDueFils: a.balanceDueFils,
    },
  };
}

export async function adminCancelAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "reservationId");
  return adminMutation(
    fd,
    (actor) => adminCancelReservation(actor, id, { reason: str(fd, "reason"), refundFils: optFils(fd, "refundFils") as number | undefined }),
    { success: "Reservation cancelled." },
  );
}

export async function createDamageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(
    fd,
    (actor) =>
      createDamageReport(actor, {
        vehicleId: str(fd, "vehicleId"),
        reservationId: opt(fd, "reservationId"),
        stage: (str(fd, "stage") || "OTHER") as "PICKUP" | "RETURN" | "OTHER",
        severity: str(fd, "severity") as "MINOR" | "MODERATE" | "MAJOR",
        location: str(fd, "location"),
        description: str(fd, "description"),
        estimatedCostFils: (optFils(fd, "estimatedCostFils") ?? 0) as number,
        imageKeys: fd.getAll("imageKeys").filter((k): k is string => typeof k === "string" && k !== ""),
      }),
    { success: "Damage report saved." },
  );
}

