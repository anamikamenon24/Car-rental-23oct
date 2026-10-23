import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getBranch, listBranches, listCategories } from "@/server/catalog";
import { Container, PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { SearchForm } from "@/components/search/search-form";
import { ClockIcon, MapPinIcon, PhoneIcon } from "@/components/ui/icons";
import { formatAED, formatTime, zoneLabel } from "@/lib/ui/format";
import { defaultTrip } from "../../_lib/trip";
import { attempt } from "../../_lib/errors";

export const metadata: Metadata = { title: "Branch" };

export default function BranchPage({ params }: PageProps<"/branches/[branch]">) {
  return (
    <Container>
      <Suspense
        fallback={
          <div className="py-10">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
          </div>
        }
      >
        <BranchContent params={params} />
      </Suspense>
    </Container>
  );
}

async function BranchContent({ params }: { params: Promise<{ branch: string }> }) {
  const { branch: key } = await params;
  await connection();
  const found = await attempt(() => getBranch(decodeURIComponent(key)));
  if (!found.ok || !found.data) notFound();
  const branch = found.data;
  const [branches, categories] = await Promise.all([listBranches(), listCategories()]);
  const now = new Date();
  const mapUrl =
    branch.latitude != null && branch.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${branch.latitude}&mlon=${branch.longitude}#map=16/${branch.latitude}/${branch.longitude}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${branch.address}, ${branch.city}`)}`;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/", label: "Home" }, { href: "/branches", label: "Branches" }, { label: branch.name }]}
        title={branch.name}
        description={
          <span className="inline-flex items-center gap-1.5">
            <MapPinIcon className="size-4" /> {branch.address}, {branch.city}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="branch-search" className="rounded-2xl border border-ink-200 bg-white p-4 sm:p-5">
            <h2 id="branch-search" className="mb-3 text-base font-semibold">
              Rent a car from {branch.name}
            </h2>
            <SearchForm
              layout="bar"
              branches={branches.map((b) => ({ id: b.id, name: b.name, city: b.city, timeZone: b.timeZone }))}
              defaults={defaultTrip(branch, now)}
            />
          </section>

          {categories.length > 0 ? (
            <section aria-labelledby="branch-cats">
              <h2 id="branch-cats" className="text-lg font-semibold">
                Car categories
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {categories.map((c) => (
                  <li key={c.id} className="rounded-xl border border-ink-200 bg-white p-4">
                    <p className="font-medium text-ink-900">{c.name}</p>
                    <p className="text-sm text-ink-600">
                      {c.fromDailyRateFils != null ? `from ${formatAED(c.fromDailyRateFils)}/day · ` : ""}deposit{" "}
                      {formatAED(c.depositFils)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Branch details" />
            <CardBody className="space-y-3 text-sm">
              {branch.openingHoursText ? (
                <p className="flex items-start gap-2">
                  <ClockIcon className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <span className="whitespace-pre-line">{branch.openingHoursText}</span>
                </p>
              ) : null}
              <p className="text-ink-600">
                Local time now:{" "}
                <span className="font-medium text-ink-900">
                  {formatTime(now, branch.timeZone)} ({zoneLabel(branch.timeZone, now)})
                </span>
              </p>
              {branch.phone ? (
                <p className="flex items-center gap-2">
                  <PhoneIcon className="size-4 text-ink-400" />
                  <a href={`tel:${branch.phone.replace(/\s+/g, "")}`} className="text-brand-700 hover:underline">
                    {branch.phone}
                  </a>
                </p>
              ) : null}
              {branch.email ? (
                <p>
                  <a href={`mailto:${branch.email}`} className="text-brand-700 hover:underline">
                    {branch.email}
                  </a>
                </p>
              ) : null}
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
              >
                <MapPinIcon className="size-4" /> Open in map
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
