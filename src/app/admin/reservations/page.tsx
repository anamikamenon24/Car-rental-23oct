import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminListReservations } from "@/server/admin/reservations";
import { listBranches } from "@/server/catalog";
import { reservationStatusValues } from "@/server/validation";
import { PageHeader } from "@/components/ui/page";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import { inputClasses } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { formatAED, formatDateTime, humanize } from "@/lib/ui/format";
import { zonedLocalToUtc } from "@/lib/ui/datetime";
import { one, type RawSearchParams } from "@/lib/ui/search-params";
import { attempt } from "../../_lib/errors";

export const metadata: Metadata = { title: "Reservations · Admin" };

export default function AdminReservationsPage({ searchParams }: PageProps<"/admin/reservations">) {
  return (
    <>
      <PageHeader title="Reservations" description="Search, filter and open bookings to check cars out and in." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <ReservationsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const PAGE_SIZE = 25;

async function ReservationsTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const actor = await requireAdmin("/admin/reservations");
  const branches = await listBranches();
  const q = one(sp.q);
  const status = one(sp.status);
  const branchId = one(sp.branchId);
  const from = one(sp.from);
  const to = one(sp.to);
  const page = Math.max(1, Number(one(sp.page) ?? "1") || 1);
  const tz = "Asia/Dubai";

  const result = await attempt(() =>
    adminListReservations(actor, {
      q,
      status: status as (typeof reservationStatusValues)[number] | undefined,
      branchId,
      from: from ? (zonedLocalToUtc(`${from}T00:00`, tz) ?? undefined) : undefined,
      to: to ? (zonedLocalToUtc(`${to}T23:59`, tz) ?? undefined) : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, status, branchId, from, to })) if (v) params.set(k, v);
    params.set("page", String(p));
    return `/admin/reservations?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Form action="/admin/reservations" className="grid gap-3 rounded-2xl border border-ink-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter reservations">
        <div className="lg:col-span-2">
          <label htmlFor="r-q" className="mb-1 block text-sm font-medium">Search</label>
          <input id="r-q" name="q" defaultValue={q} placeholder="Reference, name, email, plate" className={inputClasses} data-testid="admin-reservation-search" />
        </div>
        <div>
          <label htmlFor="r-status" className="mb-1 block text-sm font-medium">Status</label>
          <select id="r-status" name="status" defaultValue={status ?? ""} className={inputClasses} data-testid="admin-filter-status">
            <option value="">All</option>
            {reservationStatusValues.map((s) => (
              <option key={s} value={s}>{humanize(s)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="r-branch" className="mb-1 block text-sm font-medium">Branch</label>
          <select id="r-branch" name="branchId" defaultValue={branchId ?? ""} className={inputClasses} data-testid="admin-filter-branch">
            <option value="">All</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="r-from" className="mb-1 block text-sm font-medium">Pick-up from</label>
          <input id="r-from" type="date" name="from" defaultValue={from} className={inputClasses} />
        </div>
        <div>
          <label htmlFor="r-to" className="mb-1 block text-sm font-medium">Pick-up to</label>
          <input id="r-to" type="date" name="to" defaultValue={to} className={inputClasses} />
        </div>
        <div className="flex gap-2 lg:col-span-6">
          <button type="submit" className={buttonClasses("primary", "sm")} data-testid="admin-filter-apply">Apply</button>
          <Link href="/admin/reservations" className={buttonClasses("ghost", "sm")}>Reset</Link>
        </div>
      </Form>

      {!result.ok ? (
        <Alert tone="error">{result.error.message}</Alert>
      ) : result.data.items.length === 0 ? (
        <EmptyState title="No reservations match" description="Try a different search or clear the filters." data-testid="admin-reservations-empty" />
      ) : (
        <>
          <p className="text-sm text-ink-600">{result.data.total} reservations</p>
          <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Reference</th>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Vehicle</th>
                  <th scope="col" className="px-4 py-3">Pick-up</th>
                  <th scope="col" className="px-4 py-3">Return</th>
                  <th scope="col" className="px-4 py-3">Total</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {result.data.items.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50" data-testid="admin-reservation-row" data-reservation-id={r.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/reservations/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {r.customer.name}
                      <span className="block text-xs text-ink-500">{r.customer.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.vehicle.make} {r.vehicle.model}
                      <span className="block text-xs text-ink-500">{r.vehicle.plate}</span>
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTime(r.pickupAt, r.pickupBranch.timeZone)}
                      <span className="block text-xs text-ink-500">{r.pickupBranch.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      {formatDateTime(r.returnAt, r.returnBranch.timeZone)}
                      <span className="block text-xs text-ink-500">{r.returnBranch.name}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">{formatAED(r.totalFils)}</td>
                    <td className="px-4 py-3"><ReservationStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.data.total > PAGE_SIZE ? (
            <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
              {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClasses("outline", "sm")}>Previous</Link> : <span />}
              <span className="text-ink-600">Page {page} of {Math.ceil(result.data.total / PAGE_SIZE)}</span>
              {page * PAGE_SIZE < result.data.total ? <Link href={pageHref(page + 1)} className={buttonClasses("outline", "sm")}>Next</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
