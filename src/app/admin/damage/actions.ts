"use server";

import { updateDamageReport } from "@/server/admin/damage";
import type { FormState } from "@/lib/ui/form-state";
import { adminMutation, optFils, str } from "../_lib/form";

export async function updateDamageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return adminMutation(
    fd,
    (actor) =>
      updateDamageReport(actor, str(fd, "id"), {
        status: (str(fd, "status") || undefined) as "OPEN" | "REPAIRED" | "WAIVED" | undefined,
        estimatedCostFils: optFils(fd, "estimatedCostFils") as number | undefined,
        chargedFils: optFils(fd, "chargedFils") as number | undefined,
      }),
    { success: "Damage report updated.", keepValues: true },
  );
}
