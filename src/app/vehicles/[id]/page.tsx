import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getVehicle, getVehicleAvailability, listBranches, searchVehicles } from "@/server/catalog";
import { quoteRental } from "@/server/quotes";
import { Container, PageHeader } from "@/components/ui/page";
import { Card, CardBody, Badge } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/spinner";
import { VehicleImage } from "@/components/vehicles/vehicle-image";
import { VehicleSpecs } from "@/components/vehicles/vehicle-specs";
import { AvailabilityCalendar } from "@/components/vehicles/availability-calendar";
import { CheckIcon, MapPinIcon } from "@/components/ui/icons";
import { formatAED, formatDateTime, formatKm, pluralize, zoneLabel } from "@/lib/ui/format";
import { utcToZonedDate } from "@/lib/ui/datetime";
import { one, parseTrip, tripQuery, type RawSearchParams } from "@/lib/ui/search-params";
import { resolveTrip } from "../../_lib/trip";
import { attempt } from "../../_lib/errors";
import { monthNav } from "../../_lib/month";

export const metadata: Metadata = { title: "Vehicle details" };

export default function VehiclePage({ params, searchParams }: PageProps<"/vehicles/[id]">) {
  return (
    <Container>
      <Suspense fallback={<VehicleSkeleton />}>
        <VehicleContent params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function VehicleContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const found = await attempt(() => getVehicle(id));
  if (!found.ok || !found.data) notFound();
  const vehicle = found.data;
  const name = `${vehicle.make} ${vehicle.model}`;
  const tz = vehicle.branch.timeZone;

  // Trip from the search, re-anchored to this car's home branch (cars are collected where they're based).
  const tripParams = parseTrip(sp);
  const anchored = tripParams ? { ...tripParams, pickupBranch: vehicle.branch.id } : null;
  const movedBranch = tripParams && tripParams.pickupBranch !== vehicle.branch.id;
  const branches = anchored ? await listBranches() : [];
  const resolved = anchored ? resolveTrip(anchored, branches) : null;
  const trip = resolved?.ok ? resolved.trip : null;

  const today = utcToZonedDate(new Date(), tz);
  const nav = monthNav(one(sp.month), trip ? utcToZonedDate(trip.pickupAt, tz) : today, today, sp);

  const [availability, quote, search] = await Promise.all([
    getVehicleAvailability(vehicle.id, nav.fromDate, nav.days),
    trip
      ? attempt(() =>
          quoteRental({
            vehicleId: vehicle.id,
            pickupBranchId: trip.pickupBranch.id,
            returnBranchId: trip.returnBranch.id,
            pickupAt: trip.pickupAt,
            returnAt: trip.returnAt,
            extras: [],
          }),
        )
      : null,
    trip
      ? attempt(() =>
          searchVehicles({
            pickupBranchId: trip.pickupBranch.id,
            returnBranchId: trip.returnBranch.id,
            pickupAt: trip.pickupAt,
            returnAt: trip.returnAt,
          }),
        )
      : null,
  ]);
  const availableForTrip = search?.ok ? search.data.some((r) => r.vehicle.id === vehicle.id) : null;
  const photos = vehicle.photoUrls.length > 0 ? vehicle.photoUrls : vehicle.imageUrl ? [vehicle.imageUrl] : [];

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: `/search${tripParams ? tripQuery(tripParams) : ""}`, label: "Search" },
          { label: name },
        ]}
        title={
          <>
            {name} <span className="font-normal text-ink-500">{vehicle.year}</span>
          </>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone="brand">{vehicle.categoryName}</Badge>
            <span className="inline-flex items-center gap-1 text-sm">
              <MapPinIcon className="size-4" /> Based at {vehicle.branch.name}, {vehicle.branch.city}
            </span>
          </span>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-2">
            <VehicleImage
              src={photos[0]}
              alt={`${name}, main photo`}
              priority
              className="aspect-[16/9] rounded-2xl border border-ink-200"
              sizes="(min-width: 1024px) 60vw, 100vw"
            />
            {photos.length > 1 ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.slice(1, 5).map((p, i) => (
                  <VehicleImage
                    key={p}
                    src={p}
                    alt={`${name}, photo ${i + 2}`}
                    className="aspect-[4/3] rounded-xl border border-ink-200"
                    sizes="200px"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <Card>
            <CardBody className="space-y-4">
              <VehicleSpecs vehicle={vehicle} />
              {vehicle.description ? <p className="text-ink-700">{vehicle.description}</p> : null}
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Spec label="Doors" value={vehicle.doors ?? "—"} />
                <Spec label="Colour" value={vehicle.color ?? "—"} />
                <Spec label="Mileage" value={formatKm(vehicle.mileageKm)} />
                <Spec label="Deposit" value={formatAED(vehicle.category.depositFils)} />
              </dl>
              {vehicle.features.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">Features</h2>
                  <ul className="mt-2 grid gap-1.5 text-sm text-ink-700 sm:grid-cols-2">
                    {vehicle.features.map((f) => (
                      <li key={f.code} className="inline-flex items-center gap-2">
                        <CheckIcon className="size-4 text-emerald-600" /> {f.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <AvailabilityCalendar
                month={nav.month}
                days={availability}
                today={today}
                prevHref={nav.prevHref ? `/vehicles/${vehicle.id}${nav.prevHref}` : null}
                nextHref={nav.nextHref ? `/vehicles/${vehicle.id}${nav.nextHref}` : null}
                timeZoneLabel={`${vehicle.branch.city} time (${zoneLabel(tz)})`}
                selectedFrom={trip ? utcToZonedDate(trip.pickupAt, tz) : undefined}
                selectedTo={trip ? utcToZonedDate(trip.returnAt, trip.returnBranch.timeZone) : undefined}
              />
            </CardBody>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardBody className="space-y-4">
              {trip && quote?.ok ? (
                <>
                  <div>
                    <p className="text-sm text-ink-600">Your trip</p>
                    <p className="text-sm font-medium text-ink-900">
                      {formatDateTime(trip.pickupAt, trip.pickupBranch.timeZone)} →{" "}
                      {formatDateTime(trip.returnAt, trip.returnBranch.timeZone)}
                    </p>
                    {trip.returnBranch.id !== trip.pickupBranch.id ? (
                      <p className="text-xs text-ink-500">Returning to {trip.returnBranch.name}</p>
                    ) : null}
                  </div>
                  <div className="border-t border-ink-100 pt-3">
                    <p className="text-sm text-ink-600">
                      <span className="text-2xl font-bold text-ink-900" data-testid="price-daily-rate">
                        {formatAED(quote.data.dailyRateFils)}
                      </span>{" "}
                      / day · {pluralize(quote.data.days, "day")}
                    </p>
                    <p className="mt-1 text-sm text-ink-600">
                      Total from <span className="font-semibold text-ink-900">{formatAED(quote.data.totalFils)}</span>{" "}
                      incl. VAT{quote.data.oneWayFeeFils > 0 ? " and one-way fee" : ""}. Extras chosen next.
                    </p>
                  </div>
                  {movedBranch ? (
                    <Alert tone="info">This car is collected from {vehicle.branch.name}; we&apos;ve updated your pick-up branch.</Alert>
                  ) : null}
                  {availableForTrip === false ? (
                    <Alert tone="warning" title="Not available for these dates" data-testid="vehicle-unavailable">
                      This car is booked for part of your trip. Pick other dates from the calendar or search again.
                    </Alert>
                  ) : null}
                  <ButtonLink
                    href={`/book/${vehicle.id}${tripQuery(anchored!)}`}
                    size="lg"
                    className="w-full"
                    data-testid="book-now"
                    variant={availableForTrip === false ? "outline" : "primary"}
                  >
                    {availableForTrip === false ? "Choose other dates" : "Book now"}
                  </ButtonLink>
                </>
              ) : (
                <>
                  <p className="text-sm text-ink-600">
                    From{" "}
                    <span className="text-2xl font-bold text-ink-900">
                      {vehicle.fromDailyRateFils != null ? formatAED(vehicle.fromDailyRateFils) : "—"}
                    </span>{" "}
                    / day
                  </p>
                  {quote && !quote.ok ? <Alert tone="error">{quote.error.message}</Alert> : null}
                  {resolved && !resolved.ok ? <Alert tone="error">{resolved.problem.message}</Alert> : null}
                  <p className="text-sm text-ink-600">Choose your dates to see the full price and book.</p>
                  <ButtonLink href={`/book/${vehicle.id}`} size="lg" className="w-full" data-testid="book-now">
                    Choose dates
                  </ButtonLink>
                </>
              )}
              <p className="text-xs text-ink-500">
                Refundable deposit {formatAED(vehicle.category.depositFils)} is pre-authorised at payment.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function VehicleSkeleton() {
  return (
    <div className="py-10" aria-busy="true">
      <span className="sr-only" role="status">
        Loading vehicle…
      </span>
      <Skeleton className="h-8 w-72" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <Skeleton className="aspect-[16/9] rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
