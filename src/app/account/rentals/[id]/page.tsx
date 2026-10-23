import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/server/auth";
import { getCancellationQuote, getMyReservation } from "@/server/reservations";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { BookingVehicleSummary } from "@/components/booking/vehicle-summary";
import { ModifyDatesPanel } from "@/components/rentals/modify-dates-panel";
import { CancelPanel } from "@/components/rentals/cancel-panel";
import { PaymentHistory } from "@/components/rentals/payment-history";
import { formatAED, formatDateTime } from "@/lib/ui/format";
import { utcToZonedLocal } from "@/lib/ui/datetime";
import { attempt } from "../../../_lib/errors";
import { cancelRentalAction, confirmDateChangeAction, previewDateChangeAction } from "./actions";

export const metadata: Metadata = { title: "Rental details" };

export default function RentalDetailPage({ params }: PageProps<"/account/rentals/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading rental…" />}>
      <RentalDetail params={params} />
    </Suspense>
  );
}

async function RentalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const user = await requireUser(`/account/rentals/${id}`);
  const found = await attempt(() => getMyReservation(user, id));
  if (!found.ok) notFound();
  const r = found.data;
  const cancelQuote = r.canCancel ? await getCancellationQuote(user, r.id) : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/account/rentals", label: "My rentals" }, { label: r.reference }]}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="font-mono">{r.reference}</span>
            <ReservationStatusBadge status={r.status} />
          </span>
        }
        description={`${r.vehicle.make} ${r.vehicle.model} · booked ${formatDateTime(r.createdAt, r.pickupBranch.timeZone)}`}
        actions={
          <>
            {r.voucherAvailable ? (
              <ButtonLink href={`/account/rentals/${r.id}/voucher`} data-testid="view-voucher">
                View pick-up voucher
              </ButtonLink>
            ) : null}
            {r.canPay ? (
              <ButtonLink href={`/checkout/${r.id}`} variant="accent" data-testid="continue-payment">
                Complete payment
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Trip" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-ink-500">Pick-up</dt>
                  <dd className="font-medium text-ink-900">{r.pickupBranch.name}</dd>
                  <dd className="text-sm text-ink-700">{r.pickupBranch.address}</dd>
                  <dd className="mt-1 text-sm font-semibold text-ink-900" data-testid="rental-pickup-at">
                    {formatDateTime(r.pickupAt, r.pickupBranch.timeZone)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-500">Return</dt>
                  <dd className="font-medium text-ink-900">{r.returnBranch.name}</dd>
                  <dd className="text-sm text-ink-700">{r.returnBranch.address}</dd>
                  <dd className="mt-1 text-sm font-semibold text-ink-900" data-testid="rental-return-at">
                    {formatDateTime(r.returnAt, r.returnBranch.timeZone)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-500">Times are shown in each branch&apos;s local time.</p>
            </CardBody>
          </Card>

          {r.canModify ? (
            <Card>
              <CardHeader title="Change dates" description="We re-check availability and re-price your rental before you confirm." />
              <CardBody>
                <ModifyDatesPanel
                  reservationId={r.id}
                  currentPickup={utcToZonedLocal(r.pickupAt, r.pickupBranch.timeZone)}
                  currentReturn={utcToZonedLocal(r.returnAt, r.returnBranch.timeZone)}
                  pickupCity={r.pickupBranch.city}
                  returnCity={r.returnBranch.city}
                  previewAction={previewDateChangeAction}
                  confirmAction={confirmDateChangeAction}
                  initialKey={randomUUID()}
                />
              </CardBody>
            </Card>
          ) : null}

          {cancelQuote ? (
            <Card>
              <CardHeader title="Cancel booking" />
              <CardBody>
                {cancelQuote.eligible ? (
                  <CancelPanel
                    reservationId={r.id}
                    refundFils={cancelQuote.refundFils}
                    feeFils={cancelQuote.feeFils}
                    refundPercent={cancelQuote.refundPercent}
                    reason={cancelQuote.reason}
                    policy={cancelQuote.policy}
                    action={cancelRentalAction}
                  />
                ) : (
                  <p className="text-sm text-ink-700">{cancelQuote.reason}</p>
                )}
              </CardBody>
            </Card>
          ) : null}

          {r.status === "CANCELLED" || r.status === "REFUNDED" ? (
            <Card>
              <CardHeader title="Cancellation" />
              <CardBody className="text-sm text-ink-700">
                {r.cancellationReason ? <p>Reason: {r.cancellationReason}</p> : null}
                <p className="mt-1">
                  Refund: <span className="font-semibold text-ink-900">{formatAED(r.refundFils)}</span>
                </p>
              </CardBody>
            </Card>
          ) : null}

          {r.agreement ? (
            <Card>
              <CardHeader title="Rental agreement" description={`No. ${r.agreement.agreementNumber}`} />
              <CardBody className="grid gap-2 text-sm sm:grid-cols-2">
                <p>Collected: {formatDateTime(r.agreement.checkedOutAt, r.pickupBranch.timeZone)}</p>
                {r.agreement.checkedInAt ? (
                  <p>Returned: {formatDateTime(r.agreement.checkedInAt, r.returnBranch.timeZone)}</p>
                ) : null}
                {r.agreement.additionalTotalFils > 0 ? (
                  <p className="sm:col-span-2">
                    Additional charges (late return, fuel, damage, VAT):{" "}
                    <span className="font-semibold">{formatAED(r.agreement.additionalTotalFils)}</span>
                  </p>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <PaymentHistory payments={r.payments} deposits={r.deposits} timeZone={r.pickupBranch.timeZone} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody>
              <PriceBreakdown quote={r.quote} />
            </CardBody>
          </Card>
          <BookingVehicleSummary vehicle={{ ...r.vehicle, photoUrls: [] }} />
        </aside>
      </div>
    </>
  );
}
