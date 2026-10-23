import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/server/auth";
import { getDriverProfile } from "@/server/profile";
import { quoteRental } from "@/server/quotes";
import { Container, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/spinner";
import { BookingSteps } from "@/components/booking/booking-steps";
import { BookingVehicleSummary } from "@/components/booking/vehicle-summary";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { DriverStepForm } from "@/components/booking/driver-step-form";
import { serializeExtras, tripQuery, type RawSearchParams } from "@/lib/ui/search-params";
import { attempt } from "../../../_lib/errors";
import { checkAvailability, loadBookingContext } from "../../_lib/context";
import { startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Driver details" };

export default function BookDriverPage({ params, searchParams }: PageProps<"/book/[vehicleId]/driver">) {
  return (
    <Suspense fallback={<PageLoading label="Loading driver details…" />}>
      <DriverContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DriverContent({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ vehicleId }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const { vehicle, tripParams, trip, tripProblem, extras } = await loadBookingContext(vehicleId, sp);
  const extrasParam = serializeExtras(extras);
  const selfHref = `/book/${vehicleId}/driver${tripParams ? tripQuery(tripParams, { extras: extrasParam }) : ""}`;
  const user = await requireUser(selfHref);
  const name = `${vehicle.make} ${vehicle.model}`;
  const datesHref = `/book/${vehicle.id}${tripParams ? tripQuery(tripParams, { extras: extrasParam }) : ""}`;
  const extrasHref = `/book/${vehicle.id}/extras${tripParams ? tripQuery(tripParams, { extras: extrasParam }) : ""}`;

  const header = (
    <>
      <PageHeader
        title="Driver details"
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: `/vehicles/${vehicle.id}`, label: name },
          { href: datesHref, label: "Dates" },
          { href: extrasHref, label: "Extras" },
          { label: "Driver" },
        ]}
      />
      <BookingSteps current={3} />
    </>
  );

  if (!trip || !tripParams) {
    return (
      <Container>
        {header}
        <Alert tone="error" title="Choose your dates first" action={<ButtonLink href={datesHref}>Choose dates</ButtonLink>}>
          {tripProblem ?? "Your booking dates are missing."}
        </Alert>
      </Container>
    );
  }

  const [availability, quote, profile] = await Promise.all([
    checkAvailability(vehicle.id, trip),
    attempt(() =>
      quoteRental({
        vehicleId: vehicle.id,
        pickupBranchId: trip.pickupBranch.id,
        returnBranchId: trip.returnBranch.id,
        pickupAt: trip.pickupAt,
        returnAt: trip.returnAt,
        extras,
      }),
    ),
    getDriverProfile(user),
  ]);

  const searchHref = `/search${tripQuery(tripParams)}`;

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
                  <ButtonLink href={searchHref} variant="outline">
                    See other cars
                  </ButtonLink>
                </div>
              }
            >
              {availability.message}
            </Alert>
          ) : !quote.ok ? (
            <Alert tone="error" title="We couldn't price this rental" data-testid="quote-error">
              {quote.error.message}
            </Alert>
          ) : (
            <Card>
              <CardBody>
                <DriverStepForm
                  action={startCheckoutAction}
                  backHref={extrasHref}
                  searchHref={searchHref}
                  hidden={{
                    vehicleId: vehicle.id,
                    pickupBranchId: trip.pickupBranch.id,
                    returnBranchId: trip.returnBranch.id,
                    pickupAt: trip.pickupAt.toISOString(),
                    returnAt: trip.returnAt.toISOString(),
                    extras: extrasParam ?? "",
                    // One key per checkout page load; retries of the same submit reuse it.
                    idempotencyKey: randomUUID(),
                  }}
                  defaults={
                    profile
                      ? {
                          fullName: profile.fullName,
                          phone: profile.phone,
                          dateOfBirth: profile.dateOfBirth,
                          nationality: profile.nationality,
                          licenceNumber: profile.licenceNumber,
                          licenceCountry: profile.licenceCountry,
                          licenceIssuedOn: profile.licenceIssuedOn,
                          licenceExpiresOn: profile.licenceExpiresOn,
                          licenceFrontKey: profile.licenceFrontKey,
                          licenceFrontUrl: profile.licenceFrontUrl,
                          licenceBackKey: profile.licenceBackKey,
                          licenceBackUrl: profile.licenceBackUrl,
                        }
                      : { fullName: user.name }
                  }
                />
              </CardBody>
            </Card>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {quote.ok ? (
            <Card>
              <CardBody>
                <PriceBreakdown quote={quote.data} title="Your price" />
              </CardBody>
            </Card>
          ) : null}
          <BookingVehicleSummary vehicle={vehicle} trip={trip} />
        </aside>
      </div>
    </Container>
  );
}
