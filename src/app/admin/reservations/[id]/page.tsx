import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/server/auth";
import { adminGetReservation } from "@/server/admin/reservations";
import { listDamageReports } from "@/server/admin/damage";
import { listBranches } from "@/server/catalog";
import { FUEL_LEVELS, fuelLabel } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import { ActionForm, AFSelect, AFText, AFTextarea } from "@/components/ui/action-form";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { PaymentHistory } from "@/components/rentals/payment-history";
import { CheckInForm } from "@/components/admin/check-in-form";
import { DamageList, DamageReportForm } from "@/components/admin/damage";
import { formatAED, formatDate, formatDateTime, formatKm, humanize } from "@/lib/ui/format";
import { utcToZonedLocal } from "@/lib/ui/datetime";
import { attempt } from "../../../_lib/errors";
import { adminCancelAction, checkInAction, checkOutAction, createDamageAction } from "./actions";
import { updateDamageAction } from "../../damage/actions";

export const metadata: Metadata = { title: "Reservation · Admin" };

export default function AdminReservationPage({ params }: PageProps<"/admin/reservations/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading reservation…" />}>
      <AdminReservation params={params} />
    </Suspense>
  );
}

async function AdminReservation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const actor = await requireAdmin(`/admin/reservations/${id}`);
  const found = await attempt(() => adminGetReservation(actor, id));
  if (!found.ok) notFound();
  const r = found.data;
  const [damage, branches] = await Promise.all([listDamageReports(actor, { reservationId: r.id }), listBranches()]);
  const a = r.agreement;
  const vehicleId = r.vehicle.id;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/admin", label: "Admin" }, { href: "/admin/reservations", label: "Reservations" }, { label: r.reference }]}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{r.reference}</span>
            <ReservationStatusBadge status={r.status} />
          </span>
        }
        description={`Created ${formatDateTime(r.createdAt, r.pickupBranch.timeZone)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Booking" />
            <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-ink-500">Customer</p>
                <p className="font-medium">{r.customer.name}</p>
                <p>{r.customer.email}</p>
                {r.customer.phone ? <p>{r.customer.phone}</p> : null}
              </div>
              <div>
                <p className="text-ink-500">Vehicle</p>
                <p className="font-medium">
                  <Link href={`/admin/fleet/${vehicleId}`} className="text-brand-700 hover:underline">
                    {r.vehicle.make} {r.vehicle.model} {r.vehicle.year}
                  </Link>
                </p>
                <p className="font-mono">{r.vehicle.plate}</p>
              </div>
              <div>
                <p className="text-ink-500">Pick-up</p>
                <p className="font-medium">{formatDateTime(r.pickupAt, r.pickupBranch.timeZone)}</p>
                <p>{r.pickupBranch.name}</p>
              </div>
              <div>
                <p className="text-ink-500">Return</p>
                <p className="font-medium">{formatDateTime(r.returnAt, r.returnBranch.timeZone)}</p>
                <p>{r.returnBranch.name}</p>
              </div>
              {r.notes ? (
                <div className="sm:col-span-2">
                  <p className="text-ink-500">Customer notes</p>
                  <p>{r.notes}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Driver" />
            <CardBody className="text-sm">
              {r.driver ? (
                <dl className="grid gap-3 sm:grid-cols-3">
                  <Info label="Name" value={r.driver.fullName} />
                  <Info label="Phone" value={r.driver.phone} />
                  <Info label="Date of birth" value={r.driver.dateOfBirth} />
                  <Info label="Licence" value={`${r.driver.licenceNumber} (${r.driver.licenceCountry})`} />
                  <Info label="Licence expires" value={r.driver.licenceExpiresOn} />
                  <div>
                    <dt className="text-ink-500">Licence images</dt>
                    <dd className="flex gap-3">
                      {r.driver.licenceFrontUrl ? (
                        <a href={r.driver.licenceFrontUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline" data-testid="licence-front-link">
                          Front
                        </a>
                      ) : (
                        <span className="text-red-700">Front missing</span>
                      )}
                      {r.driver.licenceBackUrl ? (
                        <a href={r.driver.licenceBackUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">
                          Back
                        </a>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-ink-600">No driver profile on file.</p>
              )}
            </CardBody>
          </Card>

          {r.status === "CONFIRMED" ? (
            <Card>
              <CardHeader title="Check-out (pick-up)" description="Record the odometer and fuel as the customer drives away." />
              <CardBody>
                <ActionForm action={checkOutAction} submitLabel="Check out car" submitTestId="checkout-submit" ariaLabel="Check out">
                  <input type="hidden" name="reservationId" value={r.id} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AFText label="Odometer (km)" name="mileageKm" id="checkout-mileage" data-testid="checkout-mileage" type="number" min={0} inputMode="numeric" required />
                    <AFSelect label="Fuel level" name="fuelEighths" id="checkout-fuel" data-testid="checkout-fuel" defaultValue="8">
                      {FUEL_LEVELS.map((f) => (
                        <option key={f} value={f}>
                          {fuelLabel(f)}
                        </option>
                      ))}
                    </AFSelect>
                  </div>
                  <AFTextarea label="Notes (existing scratches, etc.)" name="notes" id="checkout-notes" rows={2} />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {a ? (
            <Card>
              <CardHeader title="Rental agreement" description={`No. ${a.agreementNumber}`} />
              <CardBody>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  <Info label="Checked out" value={formatDateTime(a.checkedOutAt, r.pickupBranch.timeZone)} />
                  <Info label="Pick-up odometer" value={formatKm(a.pickupMileageKm)} testId="agreement-pickup-mileage" />
                  <Info label="Pick-up fuel" value={fuelLabel(a.pickupFuelEighths)} />
                  {a.checkedInAt ? (
                    <>
                      <Info label="Checked in" value={formatDateTime(a.checkedInAt, r.returnBranch.timeZone)} />
                      <Info label="Return odometer" value={formatKm(a.returnMileageKm)} />
                      <Info label="Return fuel" value={a.returnFuelEighths != null ? fuelLabel(a.returnFuelEighths) : "—"} />
                      <Info label="Late fee" value={formatAED(a.lateFeeFils)} />
                      <Info label="Additional total" value={formatAED(a.additionalTotalFils)} />
                      <Info label="Deposit captured" value={formatAED(a.depositCapturedFils)} />
                    </>
                  ) : null}
                </dl>
              </CardBody>
            </Card>
          ) : null}

          {r.status === "PICKED_UP" && a ? (
            <Card>
              <CardHeader title="Check-in (return)" description="Charges are calculated by the server from the agreement and pricing rules." />
              <CardBody>
                <CheckInForm
                  action={checkInAction}
                  reservationId={r.id}
                  timeZone={r.returnBranch.timeZone}
                  defaultReturnedAt={utcToZonedLocal(new Date(), r.returnBranch.timeZone)}
                  minMileage={a.pickupMileageKm}
                  returnBranchId={r.returnBranch.id}
                  branches={branches.map((b) => ({ id: b.id, name: b.name }))}
                />
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Damage reports" />
            <CardBody className="space-y-6">
              <DamageList reports={damage} timeZone={r.pickupBranch.timeZone} updateAction={updateDamageAction} />
              <details className="rounded-xl border border-ink-200 p-4" open={r.status === "PICKED_UP" || r.status === "CONFIRMED"}>
                <summary className="cursor-pointer text-sm font-semibold">Report damage</summary>
                <div className="mt-4">
                  <DamageReportForm
                    action={createDamageAction}
                    vehicleId={vehicleId}
                    reservationId={r.id}
                    defaultStage={r.status === "CONFIRMED" ? "PICKUP" : r.status === "PICKED_UP" ? "RETURN" : "OTHER"}
                  />
                </div>
              </details>
            </CardBody>
          </Card>

          {r.status === "PENDING" || r.status === "CONFIRMED" ? (
            <Card>
              <CardHeader title="Cancel reservation" description="Refund defaults to the cancellation policy amount when left blank." />
              <CardBody>
                <ActionForm action={adminCancelAction} submitLabel="Cancel reservation" submitVariant="danger" submitTestId="admin-cancel-submit">
                  <input type="hidden" name="reservationId" value={r.id} />
                  <AFTextarea label="Reason" name="reason" id="admin-cancel-reason" rows={2} required />
                  <AFText label="Refund override (AED, optional)" name="refundFils" id="admin-cancel-refund" type="number" min={0} step="0.01" />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          <PaymentHistory payments={r.payments} deposits={r.deposits} timeZone={r.pickupBranch.timeZone} />

          {r.auditLog.length > 0 ? (
            <Card>
              <CardHeader title="Audit log" />
              <CardBody>
                <ol className="space-y-2 text-sm">
                  {r.auditLog.map((l) => (
                    <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-ink-100 pb-2">
                      <span className="font-mono text-xs">{l.action}</span>
                      <span className="text-xs text-ink-500">
                        {humanize(l.actorType)} · {formatDateTime(l.createdAt, r.pickupBranch.timeZone)}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody>
              <PriceBreakdown quote={r.quote} />
              <p className="mt-3 text-sm text-ink-600">
                Paid {formatAED(r.paidFils)}
                {r.refundFils > 0 ? ` · refunded ${formatAED(r.refundFils)}` : ""}
              </p>
              {r.cancelledAt ? (
                <p className="mt-1 text-sm text-ink-600">
                  Cancelled {formatDate(r.cancelledAt, r.pickupBranch.timeZone)}: {r.cancellationReason}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Info({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
