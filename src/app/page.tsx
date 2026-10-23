import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listBranches, listCategories } from "@/server/catalog";
import { SearchForm } from "@/components/search/search-form";
import { Container } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/spinner";
import { formatAED } from "@/lib/ui/format";
import { defaultTrip } from "./_lib/trip";
import { ArrowRightIcon, ClockIcon, MapPinIcon, ShieldIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/empty-state";

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-brand-900 pb-16 pt-12 text-white sm:pb-20 sm:pt-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,165,36,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(63,142,194,0.35),transparent_50%)]"
        />
        <Container className="relative">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-300">Dubai · Abu Dhabi · Sharjah</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">
            Rent the right car, priced clearly in AED.
          </h1>
          <p className="mt-3 max-w-xl text-brand-100 sm:text-lg">
            Live availability, VAT and deposit shown up front, and one-way rentals between our UAE branches.
          </p>
          <div className="mt-8 text-ink-900">
            <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl bg-white/60 lg:h-28" />}>
              <HomeSearch />
            </Suspense>
          </div>
        </Container>
      </section>

      <Container className="mt-14">
        <section aria-labelledby="categories-title">
          <div className="flex items-end justify-between gap-4">
            <h2 id="categories-title" className="text-2xl font-bold tracking-tight">
              Browse by category
            </h2>
            <Link href="/search" className="text-sm font-semibold text-brand-700 hover:underline">
              See all cars
            </Link>
          </div>
          <Suspense fallback={<GridSkeleton />}>
            <Categories />
          </Suspense>
        </section>

        <section aria-labelledby="why-title" className="mt-16 grid gap-4 md:grid-cols-3">
          <h2 id="why-title" className="sr-only">
            Why DriveEasy
          </h2>
          <Feature icon={<ShieldIcon className="size-5" />} title="No surprises at the counter">
            Daily rate, extras, one-way fee, 5% VAT and the refundable deposit are shown before you pay.
          </Feature>
          <Feature icon={<ClockIcon className="size-5" />} title="Free cancellation window">
            Cancel online from My rentals. The refund amount is shown before you confirm.
          </Feature>
          <Feature icon={<MapPinIcon className="size-5" />} title="Pick up here, drop off there">
            Collect in Dubai and return in Abu Dhabi or Sharjah with a transparent one-way fee.
          </Feature>
        </section>

        <section aria-labelledby="branches-title" className="mt-16">
          <div className="flex items-end justify-between gap-4">
            <h2 id="branches-title" className="text-2xl font-bold tracking-tight">
              Our branches
            </h2>
            <Link href="/branches" className="text-sm font-semibold text-brand-700 hover:underline">
              All branches
            </Link>
          </div>
          <Suspense fallback={<GridSkeleton />}>
            <Branches />
          </Suspense>
        </section>
      </Container>
    </>
  );
}

async function HomeSearch() {
  await connection();
  const branches = await listBranches();
  if (branches.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-5 text-ink-700">
        No branches are open for bookings right now. Please check back soon.
      </p>
    );
  }
  return (
    <SearchForm
      branches={branches.map((b) => ({ id: b.id, name: b.name, city: b.city, timeZone: b.timeZone }))}
      defaults={defaultTrip(branches[0], new Date())}
    />
  );
}

async function Categories() {
  await connection();
  const categories = await listCategories();
  if (categories.length === 0) {
    return <EmptyState className="mt-5" title="No categories yet" description="Our fleet is being updated." />;
  }
  return (
    <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {categories.map((c) => (
        <li key={c.id}>
          <Link
            href={`/search?category=${encodeURIComponent(c.id)}`}
            className="group flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)] transition hover:border-brand-300"
          >
            <span className="text-lg font-semibold text-ink-900">{c.name}</span>
            {c.description ? <span className="mt-1 line-clamp-2 text-sm text-ink-600">{c.description}</span> : null}
            <span className="mt-auto flex items-center justify-between pt-4 text-sm">
              <span className="text-ink-600">
                {c.fromDailyRateFils != null ? (
                  <>
                    from <span className="font-semibold text-ink-900">{formatAED(c.fromDailyRateFils)}</span>/day
                  </>
                ) : (
                  "See prices"
                )}
              </span>
              <ArrowRightIcon className="size-4 text-brand-600 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Branches() {
  await connection();
  const branches = await listBranches();
  if (branches.length === 0) {
    return <EmptyState className="mt-5" title="No branches yet" />;
  }
  return (
    <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {branches.map((b) => (
        <li key={b.id}>
          <Link
            href={`/branches/${b.slug}`}
            className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)] transition hover:border-brand-300"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
              <MapPinIcon className="size-4" /> {b.city}
              {b.isAirport ? <span className="rounded bg-accent-100 px-1.5 text-xs text-accent-700">Airport</span> : null}
            </span>
            <span className="mt-1 text-lg font-semibold text-ink-900">{b.name}</span>
            <span className="mt-1 text-sm text-ink-600">{b.address}</span>
            {b.openingHoursText ? <span className="mt-3 text-xs text-ink-500">{b.openingHoursText}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Feature({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5">
      <div className="inline-flex rounded-lg bg-accent-100 p-2 text-accent-700">{icon}</div>
      <h3 className="mt-3 font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 text-sm text-ink-600">{children}</p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
    </div>
  );
}
