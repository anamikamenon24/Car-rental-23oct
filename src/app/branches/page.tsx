import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { listBranches } from "@/server/catalog";
import { Container, PageHeader } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { ClockIcon, MapPinIcon, PhoneIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Branches" };

export default function BranchesPage() {
  return (
    <Container>
      <PageHeader
        title="Our branches"
        description="Pick up and return at any DriveEasy branch in the UAE. One-way rentals between branches carry a fixed fee."
        breadcrumbs={[{ href: "/", label: "Home" }, { label: "Branches" }]}
      />
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        }
      >
        <BranchList />
      </Suspense>
    </Container>
  );
}

async function BranchList() {
  await connection();
  const branches = await listBranches();
  if (branches.length === 0) {
    return <EmptyState icon={<MapPinIcon className="size-6" />} title="No branches are open right now" />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {branches.map((b) => (
        <li key={b.id} data-testid="branch-card">
          <Link
            href={`/branches/${b.slug}`}
            className="flex h-full flex-col rounded-2xl border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)] transition hover:border-brand-300"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
              <MapPinIcon className="size-4" /> {b.city}
              {b.isAirport ? (
                <span className="rounded bg-accent-100 px-1.5 text-xs text-accent-700">Airport</span>
              ) : null}
            </span>
            <span className="mt-1 text-lg font-semibold text-ink-900">{b.name}</span>
            <span className="mt-1 text-sm text-ink-600">{b.address}</span>
            <span className="mt-4 space-y-1 text-sm text-ink-600">
              {b.openingHoursText ? (
                <span className="flex items-start gap-2">
                  <ClockIcon className="mt-0.5 size-4 shrink-0 text-ink-400" /> {b.openingHoursText}
                </span>
              ) : null}
              {b.phone ? (
                <span className="flex items-center gap-2">
                  <PhoneIcon className="size-4 text-ink-400" /> {b.phone}
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
