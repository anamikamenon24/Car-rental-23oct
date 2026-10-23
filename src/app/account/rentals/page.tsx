import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/server/auth";
import { listMyReservations } from "@/server/reservations";
import { PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import { VehicleImage } from "@/components/vehicles/vehicle-image";
import { CarIcon, ChevronRightIcon } from "@/components/ui/icons";
import { formatAED, formatDateTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "My rentals" };

export default function RentalsPage() {
  return (
    <>
      <PageHeader title="My rentals" description="Upcoming, current and past bookings." />
      <Suspense
        fallback={
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        }
      >
        <RentalsList />
      </Suspense>
    </>
  );
}

const UPCOMING = new Set(["PENDING", "CONFIRMED", "PICKED_UP"]);

async function RentalsList() {
  const user = await requireUser("/account/rentals");
  const rentals = await listMyReservations(user);
  if (rentals.length === 0) {
    return (
      <EmptyState
        data-testid="rentals-empty"
        icon={<CarIcon className="size-6" />}
        title="No rentals yet"
        description="When you book a car it will appear here with your pick-up voucher."
        action={<ButtonLink href="/search">Find a car</ButtonLink>}
      />
    );
  }
  const upcoming = rentals.filter((r) => UPCOMING.has(r.status));
  const past = rentals.filter((r) => !UPCOMING.has(r.status));
  return (
    <div className="space-y-8">
      <RentalGroup title="Upcoming and active" rentals={upcoming} empty="No upcoming rentals." />
      <RentalGroup title="Past and cancelled" rentals={past} empty="Nothing here yet." />
    </div>
  );
}

type Rental = Awaited<ReturnType<typeof listMyReservations>>[number];

function RentalGroup({ title, rentals, empty }: { title: string; rentals: Rental[]; empty: string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">{title}</h2>
      {rentals.length === 0 ? (
        <p className="text-sm text-ink-600">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rentals.map((r) => (
            <li key={r.id}>
              <Link
                href={r.status === "PENDING" ? `/checkout/${r.id}` : `/account/rentals/${r.id}`}
                data-testid="rental-row"
                data-reservation-id={r.id}
                className="flex items-center gap-4 rounded-2xl border border-ink-200 bg-white p-3 shadow-[var(--shadow-card)] transition hover:border-brand-300 sm:p-4"
              >
                <VehicleImage
                  src={r.vehicle.imageUrl}
                  alt=""
                  className="hidden h-20 w-32 shrink-0 rounded-xl sm:block"
                  sizes="128px"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-ink-900">{r.reference}</span>
                    <ReservationStatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 font-medium text-ink-900">
                    {r.vehicle.make} {r.vehicle.model}{" "}
                    <span className="font-normal text-ink-500">· {r.vehicle.categoryName}</span>
                  </p>
                  <p className="text-sm text-ink-600">
                    {r.pickupBranch.name}, {formatDateTime(r.pickupAt, r.pickupBranch.timeZone)} →{" "}
                    {r.returnBranch.id !== r.pickupBranch.id ? `${r.returnBranch.name}, ` : ""}
                    {formatDateTime(r.returnAt, r.returnBranch.timeZone)}
                  </p>
                  {r.status === "PENDING" ? (
                    <p className="mt-1 text-xs font-medium text-amber-700">Payment pending — continue to checkout</p>
                  ) : null}
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm text-ink-500">Total</p>
                  <p className="font-semibold text-ink-900">{formatAED(r.totalFils)}</p>
                </div>
                <ChevronRightIcon className="size-5 shrink-0 text-ink-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
