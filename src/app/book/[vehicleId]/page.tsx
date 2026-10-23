import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getVehicleAvailability } from "@/server/catalog";
import { Container, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { PageLoading } from "@/components/ui/spinner";
import { BookingSteps } from "@/components/booking/booking-steps";
import { BookingDatesForm } from "@/components/booking/booking-dates-form";
import { BookingVehicleSummary } from "@/components/booking/vehicle-summary";
import { AvailabilityCalendar } from "@/components/vehicles/availability-calendar";
import { utcToZonedDate } from "@/lib/ui/datetime";
import { zoneLabel } from "@/lib/ui/format";
import { one, parsePartialTrip, type RawSearchParams } from "@/lib/ui/search-params";
import { defaultTrip } from "../../_lib/trip";
import { monthNav } from "../../_lib/month";
import { loadBookingContext } from "../_lib/context";

export const metadata: Metadata = { title: "Choose dates" };

export default function BookDatesPage({ params, searchParams }: PageProps<"/book/[vehicleId]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading booking…" />}>
      <DatesContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function DatesContent({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const [{ vehicleId }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const { vehicle, branches, trip, tripProblem } = await loadBookingContext(vehicleId, sp);
  const tz = vehicle.branch.timeZone;
  const partial = parsePartialTrip(sp);
  const fallback = defaultTrip(vehicle.branch, new Date());
  const today = utcToZonedDate(new Date(), tz);
  const nav = monthNav(one(sp.month), trip ? utcToZonedDate(trip.pickupAt, tz) : fallback.pickupAt.slice(0, 10), today, sp);
  const availability = await getVehicleAvailability(vehicle.id, nav.fromDate, nav.days);
  const options = branches.map((b) => ({ id: b.id, name: b.name, city: b.city, timeZone: b.timeZone }));
  const name = `${vehicle.make} ${vehicle.model}`;

  return (
    <Container>
      <PageHeader
        title="Choose your dates"
        breadcrumbs={[
          { href: "/", label: "Home" },
          { href: `/vehicles/${vehicle.id}`, label: name },
          { label: "Book" },
        ]}
      />
      <BookingSteps current={1} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardBody>
              <BookingDatesForm
                action={`/book/${vehicle.id}/extras`}
                pickupBranch={{
                  id: vehicle.branch.id,
                  name: vehicle.branch.name,
                  city: vehicle.branch.city,
                  timeZone: vehicle.branch.timeZone,
                }}
                branches={options}
                defaults={{
                  returnBranch: partial.returnBranch ?? vehicle.branch.id,
                  pickupAt: partial.pickupAt ?? fallback.pickupAt,
                  returnAt: partial.returnAt ?? fallback.returnAt,
                }}
                extras={one(sp.extras)}
                error={tripProblem}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <AvailabilityCalendar
                month={nav.month}
                days={availability}
                today={today}
                prevHref={nav.prevHref ? `/book/${vehicle.id}${nav.prevHref}` : null}
                nextHref={nav.nextHref ? `/book/${vehicle.id}${nav.nextHref}` : null}
                timeZoneLabel={`${vehicle.branch.city} time (${zoneLabel(tz)})`}
                selectedFrom={trip ? utcToZonedDate(trip.pickupAt, tz) : undefined}
                selectedTo={trip ? utcToZonedDate(trip.returnAt, trip.returnBranch.timeZone) : undefined}
              />
            </CardBody>
          </Card>
        </div>
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <BookingVehicleSummary vehicle={vehicle} trip={trip} />
        </aside>
      </div>
    </Container>
  );
}
