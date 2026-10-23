import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/server/auth";
import { getMyReservation } from "@/server/reservations";
import { Container, PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import { BookingSteps } from "@/components/booking/booking-steps";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { PaymentForm } from "@/components/booking/payment-form";
import { BookingVehicleSummary } from "@/components/booking/vehicle-summary";
import { formatAED } from "@/lib/ui/format";
import { one } from "@/lib/ui/search-params";
import { attempt } from "../../_lib/errors";
import { cancelCheckoutAction, payAction } from "./actions";

export const metadata: Metadata = { title: "Checkout" };

export default function CheckoutPage({ params, searchParams }: PageProps<"/checkout/[reservationId]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading checkout…" />}>
      <CheckoutContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CheckoutContent({
  params,
  searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ reservationId }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const user = await requireUser(`/checkout/${reservationId}`);
  const found = await attempt(() => getMyReservation(user, reservationId));
  if (!found.ok) notFound();
  const r = found.data;

  if (r.status === "CONFIRMED" || r.status === "PICKED_UP") {
    redirect(`/account/rentals/${r.id}/voucher`);
  }

  const vehicleName = `${r.vehicle.make} ${r.vehicle.model}`;

  return (
    <Container>
      <PageHeader
        title="Checkout"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Reservation <span className="font-mono font-semibold text-ink-900">{r.reference}</span>
            <ReservationStatusBadge status={r.status} />
          </span>
        }
        breadcrumbs={[{ href: "/", label: "Home" }, { href: "/account/rentals", label: "My rentals" }, { label: "Checkout" }]}
      />
      <BookingSteps current={4} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {one(sp.cancelError) ? (
            <Alert tone="error">We couldn&apos;t cancel this booking. Please try again.</Alert>
          ) : null}
          {r.status === "PENDING" && r.canPay && r.holdExpiresAt ? (
            <Card>
              <CardHeader title="Payment" description="Review the price, then pay to confirm your booking." />
              <CardBody>
                <PaymentForm
                  reservationId={r.id}
                  vehicleId={r.vehicle.id}
                  holdExpiresAt={new Date(r.holdExpiresAt).toISOString()}
                  totalLabel={formatAED(r.quote.totalFils)}
                  depositLabel={formatAED(r.quote.depositFils)}
                  initialKey={randomUUID()}
                  payAction={payAction}
                  cancelAction={cancelCheckoutAction}
                  searchHref="/search"
                />
              </CardBody>
            </Card>
          ) : (
            <Alert
              tone={r.status === "PENDING" ? "warning" : "info"}
              data-testid={r.status === "EXPIRED" ? "hold-expired" : "checkout-closed"}
              title={
                r.status === "EXPIRED"
                  ? "Your hold has expired"
                  : r.status === "CANCELLED"
                    ? "This booking was cancelled"
                    : "This booking can't be paid"
              }
              action={
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={`/vehicles/${r.vehicle.id}`}>Book {vehicleName} again</ButtonLink>
                  <ButtonLink href="/search" variant="outline">
                    Search cars
                  </ButtonLink>
                </div>
              }
            >
              {r.status === "EXPIRED"
                ? "Payment wasn't completed in time, so the car was released. You have not been charged."
                : "No payment is needed for this reservation."}
            </Alert>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody>
              <PriceBreakdown quote={r.quote} title="Final price" />
            </CardBody>
          </Card>
          <BookingVehicleSummary
            vehicle={{
              make: r.vehicle.make,
              model: r.vehicle.model,
              year: r.vehicle.year,
              categoryName: r.vehicle.categoryName,
              imageUrl: r.vehicle.imageUrl,
              photoUrls: [],
            }}
            trip={{
              pickupBranch: r.pickupBranch,
              returnBranch: r.returnBranch,
              pickupAt: new Date(r.pickupAt),
              returnAt: new Date(r.returnAt),
            }}
          />
        </aside>
      </div>
    </Container>
  );
}
