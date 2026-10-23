"use client";

import { useActionState } from "react";
import { FUEL_LEVELS, fuelLabel } from "@/lib/constants";
import { CheckboxField, FormMessage, SelectField, TextareaField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatAED } from "@/lib/ui/format";
import type { CheckInState } from "@/app/admin/reservations/[id]/actions";

/** Return inspection: preview server-calculated late/fuel/damage charges, then complete check-in. */
export function CheckInForm({
  action,
  reservationId,
  timeZone,
  defaultReturnedAt,
  minMileage,
  returnBranchId,
  branches,
}: {
  action: (prev: CheckInState, fd: FormData) => Promise<CheckInState>;
  reservationId: string;
  timeZone: string;
  defaultReturnedAt: string;
  minMileage: number;
  returnBranchId: string;
  branches: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as CheckInState);
  const v = state.values;
  const e = state.fieldErrors;
  const s = state.summary;

  return (
    <form action={formAction} className="space-y-4" aria-label="Check in" noValidate>
      <input type="hidden" name="reservationId" value={reservationId} />
      <input type="hidden" name="timeZone" value={timeZone} />
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Returned at"
          name="returnedAt"
          id="checkin-returned-at"
          data-testid="checkin-returned-at"
          type="datetime-local"
          defaultValue={v?.returnedAt ?? defaultReturnedAt}
          hint="Return branch local time"
          error={e?.returnedAt}
        />
        <TextField
          label="Odometer (km)"
          name="mileageKm"
          id="checkin-mileage"
          data-testid="checkin-mileage"
          type="number"
          inputMode="numeric"
          min={minMileage}
          required
          defaultValue={v?.mileageKm ?? ""}
          hint={`At least ${minMileage} km (pick-up reading)`}
          error={e?.mileageKm}
        />
        <SelectField
          label="Fuel level"
          name="fuelEighths"
          id="checkin-fuel"
          data-testid="checkin-fuel"
          defaultValue={v?.fuelEighths ?? "8"}
          error={e?.fuelEighths}
        >
          {FUEL_LEVELS.map((f) => (
            <option key={f} value={f}>
              {fuelLabel(f)}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Damage charge (AED)"
          name="damageChargeFils"
          id="checkin-damage"
          data-testid="checkin-damage"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          defaultValue={v?.damageChargeFils ?? "0"}
          error={e?.damageChargeFils}
        />
        <SelectField
          label="Returned to branch"
          name="returnBranchId"
          id="checkin-branch"
          defaultValue={v?.returnBranchId ?? returnBranchId}
          error={e?.returnBranchId}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Deposit"
          name="depositAction"
          id="checkin-deposit-action"
          data-testid="checkin-deposit-action"
          defaultValue={v?.depositAction ?? "AUTO"}
          hint="Automatic keeps what's owed and releases the rest."
          error={e?.depositAction}
        >
          <option value="AUTO">Automatic (capture charges, release rest)</option>
          <option value="RELEASE">Release in full</option>
          <option value="CAPTURE">Capture an amount</option>
        </SelectField>
        <TextField
          label="Capture amount (AED, when capturing)"
          name="captureFils"
          id="checkin-capture"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          defaultValue={v?.captureFils ?? ""}
          error={e?.captureFils}
        />
        <CheckboxField
          label="Charge for missing fuel"
          name="chargeFuel"
          id="checkin-charge-fuel"
          defaultChecked={v ? v.chargeFuel === "on" : true}
          wrapperClassName="self-end pb-2"
        />
      </div>
      <TextareaField label="Return notes" name="notes" id="checkin-notes" rows={2} defaultValue={v?.notes ?? ""} />

      {s ? (
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4" data-testid="checkin-summary">
          <p className="mb-2 text-sm font-semibold">{state.completed ? "Final charges" : "Charges preview"}</p>
          <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
            <Row label={`Late return (${s.lateMinutes} min)`} testId="checkin-late-fee" value={s.lateFeeFils} />
            <Row label="Fuel" testId="checkin-fuel-charge" value={s.fuelChargeFils} />
            <Row label="Damage" testId="checkin-damage-charge" value={s.damageChargeFils} />
            <Row label="VAT" testId="checkin-vat" value={s.vatFils} />
            <Row label="Additional charges total" testId="checkin-total" value={s.totalFils} strong />
            <Row label="Deposit held" value={s.depositFils} />
            <Row label="Deposit captured" testId="checkin-deposit-capture" value={s.depositCaptureFils} />
            <Row label="Deposit released" testId="checkin-deposit-release" value={s.depositReleaseFils} strong />
            <Row label="Balance due from customer" testId="checkin-balance" value={s.balanceDueFils} />
          </dl>
        </div>
      ) : null}

      {!state.completed ? (
        <div className="flex flex-wrap gap-2">
          <SubmitButton variant="outline" name="intent" value="preview" pending={pending} data-testid="checkin-preview">
            Preview charges
          </SubmitButton>
          <SubmitButton name="intent" value="complete" pending={pending} data-testid="checkin-submit">
            Complete check-in
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

function Row({ label, value, testId, strong }: { label: string; value: number; testId?: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-600">{label}</dt>
      <dd className={strong ? "font-bold text-ink-900" : "font-medium text-ink-900"} data-testid={testId}>
        {formatAED(value)}
      </dd>
    </div>
  );
}
