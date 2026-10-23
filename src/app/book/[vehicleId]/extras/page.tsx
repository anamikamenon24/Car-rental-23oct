import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { listExtras } from "@/server/catalog";
import { quoteRental } from "@/server/quotes";
import { Container, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/spinner";
import { BookingSteps } from "@/components/booking/booking-steps";
import { BookingVehicleSummary } from "@/components/booking/vehicle-summary";
import { ExtrasForm } from "@/components/booking/extras-form";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { tripQuery, type RawSearchParams } from "@/lib/ui/search-params";
import { attempt } from "../../../_lib/errors";
import { checkAvailability, loadBookingContext } from "../../_lib/context";

export const metadata: Metadata = { title: "Choose extras" };

export default function BookExtrasPage({ params, searchParams }: PageProps<"/book/[vehicleId]/extras">) {
  return (
    <Suspense fallback={<PageLoading label="Pricing your rental…" />}>
      <ExtrasContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ExtrasContent({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ vehicleId }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const { vehicle, tripParams, trip, tripProblem, extras: selected } = await loadBookingContext(vehicleId, sp);
  const name = `${vehicle.make} ${vehicle.model}`;
  const datesHref = `/book/${vehicle.id}${tripParams ? tripQuery(tripParams) : ""}`;

  const header = (
    <>
      <PageHeader
        title="Extras"
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: `/vehicles/${vehicle.id}`, label: name },
          { href: datesHref, label: "Dates" },
          { label: "Extras" },
        ]}
      />
      <BookingSteps current={2} />
    </>
  );

  if (!trip || !tripParams) {
    return (
      <Container>
        {header}
        <Alert
          tone="error"
          title="Choose your dates first"
          action={<ButtonLink href={datesHref}>Choose dates</ButtonLink>}
        >
          {tripProblem ?? "We need your pick-up and return times to price extras."}
        </Alert>
      </Container>
    );
  }

  const [availability, allExtras, quote] = await Promise.all([
    checkAvailability(vehicle.id, trip),
    listExtras(),
    attempt(() =>
      quoteRental({
        vehicleId: vehicle.id,
        pickupBranchId: trip.pickupBranch.id,
        returnBranchId: trip.returnBranch.id,
        pickupAt: trip.pickupAt,
        returnAt: trip.returnAt,
        extras: selected,
      }),
    ),
  ]);

  return (
    <Container>
      {header}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          {!availability.available ? (
            <Alert
              tone="error"
              title="This car isn't available"
              data-testid="vehicle-unavailable"
              action={
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={datesHref}>Change dates</ButtonLink>
                  <ButtonLink href={`/search${tripQuery({ ...tripParams })}`} variant="outline">
                    See other cars
                  </ButtonLink>
                </div>
              }
            >
              {availability.message}
            </Alert>
          ) : null}
          <Card>
            <CardBody>
              {allExtras.length === 0 ? (
                <p className="text-sm text-ink-600">No extras are offered right now.</p>
              ) : null}
              <ExtrasForm
                vehicleId={vehicle.id}
                trip={tripParams}
                extras={allExtras.map((e) => ({
                  id: e.id,
                  code: e.code,
                  name: e.name,
                  description: e.description ?? null,
                  chargeType: e.chargeType,
                  priceFils: e.priceFils,
                  maxChargeFils: e.maxChargeFils ?? null,
                  maxQuantity: e.maxQuantity,
                }))}
                selected={selected}
                disabled={!availability.available || !quote.ok}
              />
            </CardBody>
          </Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody>
              {quote.ok ? (
                <PriceBreakdown quote={quote.data} />
              ) : (
                <Alert tone="error" title="We couldn't price this rental" data-testid="quote-error">
                  {quote.error.message}
                </Alert>
              )}
            </CardBody>
          </Card>
          <BookingVehicleSummary vehicle={vehicle} trip={trip} />
        </aside>
      </div>
    </Container>
  );
}
