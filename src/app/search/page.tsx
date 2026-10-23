import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { listBranches, listCategories, searchVehicles } from "@/server/catalog";
import { SearchForm } from "@/components/search/search-form";
import { SearchFilters, SortSelect } from "@/components/search/search-filters";
import { VehicleCard } from "@/components/vehicles/vehicle-card";
import { Container, PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { CarIcon, CalendarIcon } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { formatDateTime, pluralize } from "@/lib/ui/format";
import { parseFilters, parsePartialTrip, parseTrip, tripQuery, type RawSearchParams } from "@/lib/ui/search-params";
import { defaultTrip, resolveTrip } from "../_lib/trip";
import { attempt } from "../_lib/errors";

export const metadata: Metadata = { title: "Find a car" };

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <Container>
      <PageHeader
        title="Find a car"
        description="Only cars that are free for your whole trip are shown. Prices include 5% VAT."
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Search" }]}
      />
      <Suspense fallback={<ResultsSkeleton />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function SearchResults({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  await connection();
  const [branches, categories] = await Promise.all([listBranches(), listCategories()]);
  const filters = parseFilters(sp);
  const branchOptions = branches.map((b) => ({ id: b.id, name: b.name, city: b.city, timeZone: b.timeZone }));
  const filterQuery = {
    category: filters.category,
    transmission: filters.transmission,
    seats: filters.seats ? String(filters.seats) : undefined,
    fuel: filters.fuel,
    minPrice: filters.minPrice != null ? String(filters.minPrice) : undefined,
    maxPrice: filters.maxPrice != null ? String(filters.maxPrice) : undefined,
    sort: filters.sort,
  };

  const tripParams = parseTrip(sp);
  const fallback = { ...defaultTrip(branches[0], new Date()), ...stripUndefined(parsePartialTrip(sp)) };

  if (!tripParams) {
    return (
      <div className="space-y-6">
        <SearchForm branches={branchOptions} defaults={fallback} layout="hero" keepParams={filterQuery} />
        <EmptyState
          icon={<CalendarIcon className="size-6" />}
          title="Where and when do you need a car?"
          description="Choose a pick-up branch and your dates to see cars that are available for the whole trip."
        />
      </div>
    );
  }

  const resolved = resolveTrip(tripParams, branches);
  if (!resolved.ok) {
    return (
      <div className="space-y-6">
        <SearchForm branches={branchOptions} defaults={fallback} layout="hero" keepParams={filterQuery} />
        <Alert tone="error" title="Please check your search" data-testid="search-error">
          {resolved.problem.message}
        </Alert>
      </div>
    );
  }
  const { trip } = resolved;

  const result = await attempt(() =>
    searchVehicles({
      pickupBranchId: trip.pickupBranch.id,
      returnBranchId: trip.returnBranch.id,
      pickupAt: trip.pickupAt,
      returnAt: trip.returnAt,
      categoryId: filters.category,
      transmission: filters.transmission as "AUTOMATIC" | "MANUAL" | undefined,
      fuelType: filters.fuel as "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC" | undefined,
      minSeats: filters.seats,
      minDailyFils: filters.minPrice != null ? filters.minPrice * 100 : undefined,
      maxDailyFils: filters.maxPrice != null ? filters.maxPrice * 100 : undefined,
      sort: (filters.sort as "price_asc" | "price_desc" | "seats" | "newest" | undefined) ?? "price_asc",
    }),
  );

  const fullQuery: Record<string, string> = Object.fromEntries(
    Object.entries({ ...tripParams, ...filterQuery }).filter((e): e is [string, string] => Boolean(e[1])),
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)]">
        <SearchForm
          branches={branchOptions}
          defaults={tripParams}
          layout="bar"
          keepParams={filterQuery}
          submitLabel="Update search"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <details className="group rounded-2xl border border-ink-200 bg-white p-4 lg:open:block" open>
            <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900 lg:pointer-events-none">
              Filters
            </summary>
            <div className="mt-4">
              <SearchFilters
                trip={tripParams}
                filters={filters}
                categories={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            </div>
          </details>
        </aside>

        <section aria-labelledby="results-title" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="results-title" className="text-lg font-semibold" data-testid="results-count">
                {result.ok ? `${pluralize(result.data.length, "car")} available` : "Search results"}
              </h2>
              <p className="text-sm text-ink-600">
                {trip.pickupBranch.name} · {formatDateTime(trip.pickupAt, trip.pickupBranch.timeZone)} →{" "}
                {trip.returnBranch.id !== trip.pickupBranch.id ? `${trip.returnBranch.name} · ` : ""}
                {formatDateTime(trip.returnAt, trip.returnBranch.timeZone)}
              </p>
            </div>
            <SortSelect query={fullQuery} value={filters.sort ?? "price_asc"} />
          </div>

          {!result.ok ? (
            <Alert tone="error" title="We couldn't search for these dates" data-testid="search-error">
              {result.error.message}
            </Alert>
          ) : result.data.length === 0 ? (
            <EmptyState
              data-testid="empty-results"
              icon={<CarIcon className="size-6" />}
              title="No cars match your search"
              description="Try different dates, another branch, or fewer filters."
              action={
                <ButtonLink href={`/search${tripQuery(tripParams)}`} variant="outline">
                  Clear filters
                </ButtonLink>
              }
            />
          ) : (
            <ul className="space-y-4">
              {result.data.map((r) => (
                <li key={r.vehicle.id}>
                  <VehicleCard result={r} href={`/vehicles/${r.vehicle.id}${tripQuery(tripParams)}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function ResultsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only" role="status">
        Searching for available cars…
      </span>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Skeleton className="h-96 rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
