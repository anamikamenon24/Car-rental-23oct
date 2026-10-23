import type { DamageReportDto } from "@/server/admin/damage";
import type { FormState } from "@/lib/ui/form-state";
import { ActionForm, AFSelect, AFText, AFTextarea } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAED, formatDateTime, humanize } from "@/lib/ui/format";
import { DamagePhotos } from "./damage-photos";

export function DamageReportForm({
  action,
  vehicleId,
  reservationId,
  defaultStage = "OTHER",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  vehicleId: string;
  reservationId?: string;
  defaultStage?: "PICKUP" | "RETURN" | "OTHER";
}) {
  return (
    <ActionForm action={action} submitLabel="Save damage report" submitTestId="damage-submit" ariaLabel="New damage report">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {reservationId ? <input type="hidden" name="reservationId" value={reservationId} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <AFSelect label="Stage" name="stage" id="damage-stage" data-testid="damage-stage" defaultValue={defaultStage}>
          <option value="PICKUP">At pick-up</option>
          <option value="RETURN">At return</option>
          <option value="OTHER">Other</option>
        </AFSelect>
        <AFSelect label="Severity" name="severity" id="damage-severity" data-testid="damage-severity" defaultValue="MINOR" required>
          <option value="MINOR">Minor</option>
          <option value="MODERATE">Moderate</option>
          <option value="MAJOR">Major</option>
        </AFSelect>
        <AFText
          label="Estimated cost (AED)"
          name="estimatedCostFils"
          id="damage-cost"
          data-testid="damage-cost"
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          defaultValue="0"
        />
      </div>
      <AFText label="Location on car" name="location" id="damage-location" data-testid="damage-location" placeholder="e.g. Rear bumper, left" required />
      <AFTextarea label="Description" name="description" id="damage-description" data-testid="damage-description" rows={3} required />
      <DamagePhotos />
    </ActionForm>
  );
}

export function DamageList({
  reports,
  timeZone,
  updateAction,
}: {
  reports: DamageReportDto[];
  timeZone: string;
  updateAction?: (prev: FormState, fd: FormData) => Promise<FormState>;
}) {
  if (reports.length === 0) return <p className="text-sm text-ink-600" data-testid="damage-empty">No damage reported.</p>;
  return (
    <ul className="space-y-3">
      {reports.map((d) => (
        <li key={d.id} className="rounded-xl border border-ink-200 p-4" data-testid="damage-row" data-damage-id={d.id}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.severity} />
            <StatusBadge status={d.status} testId="damage-status" />
            <span className="text-sm font-medium text-ink-900">{d.location}</span>
            <span className="text-xs text-ink-500">
              {humanize(d.stage)} · {formatDateTime(d.createdAt, timeZone)}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-700">
            {d.vehicle.make} {d.vehicle.model} ({d.vehicle.plate})
            {d.reservationReference ? ` · ${d.reservationReference}` : ""}
          </p>
          <p className="mt-1 text-sm text-ink-800">{d.description}</p>
          <p className="mt-1 text-xs text-ink-600">
            Estimated {formatAED(d.estimatedCostFils)} · charged {formatAED(d.chargedFils)}
          </p>
          {d.imageUrls.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.imageUrls.map((u, i) => (
                <li key={u}>
                  <a href={u} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked file route */}
                    <img src={u} alt={`Damage photo ${i + 1}`} className="size-20 rounded-lg border border-ink-200 object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {updateAction ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-brand-700">Update</summary>
              <ActionForm action={updateAction} submitLabel="Save" submitSize="sm" submitTestId="damage-update-submit" className="mt-3">
                <input type="hidden" name="id" value={d.id} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <AFSelect label="Status" name="status" id={`damage-status-${d.id}`} data-testid="damage-update-status" defaultValue={d.status}>
                    <option value="OPEN">Open</option>
                    <option value="REPAIRED">Repaired</option>
                    <option value="WAIVED">Waived</option>
                  </AFSelect>
                  <AFText
                    label="Estimated (AED)"
                    name="estimatedCostFils"
                    id={`damage-est-${d.id}`}
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={(d.estimatedCostFils / 100).toFixed(2)}
                  />
                  <AFText
                    label="Charged (AED)"
                    name="chargedFils"
                    id={`damage-charged-${d.id}`}
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={(d.chargedFils / 100).toFixed(2)}
                  />
                </div>
              </ActionForm>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
