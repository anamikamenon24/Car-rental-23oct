import Link from "next/link";
import type { SearchResult } from "@/server/catalog";
import { Badge } from "@/components/ui/card";
import { formatAED, pluralize } from "@/lib/ui/format";
import { VehicleImage } from "./vehicle-image";
import { VehicleSpecs } from "./vehicle-specs";
import { ArrowRightIcon } from "@/components/ui/icons";

export function VehicleCard({ result, href }: { result: SearchResult; href: string }) {
  const v = result.vehicle;
  const name = `${v.make} ${v.model}`;
  return (
    <article
      data-testid="vehicle-card"
      data-vehicle-id={v.id}
      className="group flex flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)] sm:flex-row"
    >
      <VehicleImage
        src={v.imageUrl ?? v.photoUrls[0]}
        alt={`${name} ${v.year}`}
        className="aspect-[16/10] sm:aspect-auto sm:w-64 sm:shrink-0"
        sizes="(min-width: 640px) 256px, 100vw"
      />
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Badge tone="brand">{v.categoryName}</Badge>
            <h2 className="mt-1.5 text-lg font-semibold text-ink-900">
              <Link href={href} className="hover:underline">
                {name}
              </Link>{" "}
              <span className="font-normal text-ink-500">{v.year}</span>
            </h2>
            <p className="text-xs text-ink-500">or similar · {v.color}</p>
          </div>
        </div>
        <VehicleSpecs vehicle={v} />
        {v.features.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {v.features.slice(0, 4).map((f) => (
              <li key={f.code} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
                {f.name}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-ink-100 pt-3">
          <div>
            <p className="text-sm text-ink-600">
              <span className="text-xl font-bold text-ink-900" data-testid="vehicle-daily-rate">
                {formatAED(result.dailyRateFils)}
              </span>{" "}
              / day
            </p>
            <p className="text-xs text-ink-500">
              <span data-testid="vehicle-estimated-total">{formatAED(result.estimatedTotalFils)}</span> total for{" "}
              {pluralize(result.days, "day")} incl. VAT
              {result.oneWayFeeFils > 0 ? " and one-way fee" : ""}
            </p>
          </div>
          <Link
            href={href}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            aria-label={`View ${name} details`}
          >
            View deal <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
