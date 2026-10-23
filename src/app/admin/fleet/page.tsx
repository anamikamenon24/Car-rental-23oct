import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminListVehicles, listCategoriesAdmin } from "@/server/admin/fleet";
import { adminListBranches } from "@/server/admin/branches";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClasses } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { formatAED } from "@/lib/ui/format";
import { one, type RawSearchParams } from "@/lib/ui/search-params";
import { ActionForm, AFText } from "@/components/ui/action-form";
import { createCategoryAction } from "./actions";

export const metadata: Metadata = { title: "Fleet · Admin" };

const STATUSES = ["AVAILABLE", "RESERVED", "ON_RENT", "MAINTENANCE", "RETIRED"] as const;

export default function AdminFleetPage({ searchParams }: PageProps<"/admin/fleet">) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader title="Fleet" description="Manage vehicles, availability, categories and maintenance blocks." />
        <Link href="/admin/fleet/new" className={buttonClasses("primary", "md")}>
          + Add vehicle
        </Link>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <FleetList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FleetList({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const actor = await requireAdmin("/admin/fleet");
  const q = one(sp.q);
  const branchId = one(sp.branchId);
  const categoryId = one(sp.categoryId);
  const rawStatus = one(sp.status);
  const status = STATUSES.find((s) => s === rawStatus);

  const [vehicles, branches, categories] = await Promise.all([
    adminListVehicles(actor, { q, branchId, categoryId, status }),
    adminListBranches(actor),
    listCategoriesAdmin(actor),
  ]);

  return (
    <div className="space-y-8">
      {/* Filter bar */}
      <Form action="/admin/fleet" className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-200 bg-white p-4">
        <div className="min-w-[180px] flex-1">
          <label htmlFor="fleet-q" className="mb-1 block text-xs font-medium text-ink-600">
            Search
          </label>
          <input
            id="fleet-q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Make, model, plate, VIN..."
            className={inputClasses}
          />
        </div>
        <div className="w-44">
          <label htmlFor="fleet-branch" className="mb-1 block text-xs font-medium text-ink-600">
            Branch
          </label>
          <select id="fleet-branch" name="branchId" defaultValue={branchId ?? ""} className={inputClasses}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <label htmlFor="fleet-cat" className="mb-1 block text-xs font-medium text-ink-600">
            Category
          </label>
          <select id="fleet-cat" name="categoryId" defaultValue={categoryId ?? ""} className={inputClasses}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <label htmlFor="fleet-status" className="mb-1 block text-xs font-medium text-ink-600">
            Status
          </label>
          <select id="fleet-status" name="status" defaultValue={status ?? ""} className={inputClasses}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClasses("outline", "md")}>
          Filter
        </button>
        {(q || branchId || categoryId || status) && (
          <Link href="/admin/fleet" className={buttonClasses("ghost", "md")}>
            Clear
          </Link>
        )}
      </Form>

      {/* Vehicles Table */}
      <Card>
        <CardHeader
          title={`Vehicles (${vehicles.length})`}
          description="Click a vehicle to view maintenance history, update details or change status."
        />
        <CardBody className="p-0">
          {vehicles.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No vehicles found" description="Try clearing your filters or add a new vehicle." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Vehicle</th>
                    <th scope="col" className="px-4 py-3">Plate / VIN</th>
                    <th scope="col" className="px-4 py-3">Category</th>
                    <th scope="col" className="px-4 py-3">Branch</th>
                    <th scope="col" className="px-4 py-3">Mileage</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-ink-50/50" data-testid="admin-vehicle-row">
                      <td className="px-4 py-3 font-semibold text-ink-900">
                        <Link href={`/admin/fleet/${v.id}`} className="hover:text-brand-600 hover:underline">
                          {v.year} {v.make} {v.model}
                        </Link>
                        <span className="block text-xs font-normal text-ink-500">{v.color} · {v.transmission.toLowerCase()}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-ink-800">{v.plate}</span>
                        <span className="block font-mono text-xs text-ink-400">{v.vin}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-700">{v.categoryName}</td>
                      <td className="px-4 py-3 text-ink-700">{v.branchName}</td>
                      <td className="px-4 py-3 text-ink-600">{v.mileageKm.toLocaleString()} km</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/fleet/${v.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                          Edit →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Categories section */}
      <Card>
        <CardHeader
          title="Vehicle Categories"
          description="Categories define default refundable deposits and base vehicle grouping."
        />
        <CardBody className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Category</th>
                  <th scope="col" className="px-4 py-2.5">Code</th>
                  <th scope="col" className="px-4 py-2.5">Deposit</th>
                  <th scope="col" className="px-4 py-2.5">Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{c.name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600">{c.code}</td>
                    <td className="px-4 py-2.5 text-ink-700">{formatAED(c.depositFils)}</td>
                    <td className="px-4 py-2.5 text-ink-500">{c.sortOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700 hover:underline">
              + Add new category
            </summary>
            <div className="mt-4">
              <ActionForm action={createCategoryAction} submitLabel="Create category">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <AFText label="Name" name="name" placeholder="e.g. Electric" required />
                  <AFText label="Code" name="code" placeholder="e.g. ELECTRIC" hint="2-20 uppercase chars" required />
                  <AFText label="Slug" name="slug" placeholder="e.g. electric" hint="lowercase-dashes" required />
                  <AFText label="Deposit (AED)" name="depositFils" type="number" min="0" placeholder="e.g. 1500" required />
                </div>
              </ActionForm>
            </div>
          </details>
        </CardBody>
      </Card>
    </div>
  );
}
