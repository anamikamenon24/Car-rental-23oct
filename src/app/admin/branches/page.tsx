import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminListBranches } from "@/server/admin/branches";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { BranchFields } from "@/components/admin/branch-fields";
import { createBranchAction } from "./actions";

export const metadata: Metadata = { title: "Branches · Admin" };

export default function AdminBranchesPage() {
  return (
    <>
      <PageHeader title="Branches" description="Locations, time zones and opening hours." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Branches />
      </Suspense>
    </>
  );
}

async function Branches() {
  const actor = await requireAdmin("/admin/branches");
  const branches = await adminListBranches(actor);
  return (
    <div className="space-y-6">
      {branches.length === 0 ? (
        <EmptyState title="No branches yet" description="Add your first branch below." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3">Branch</th>
                <th scope="col" className="px-4 py-3">Code</th>
                <th scope="col" className="px-4 py-3">City</th>
                <th scope="col" className="px-4 py-3">Time zone</th>
                <th scope="col" className="px-4 py-3">Hours</th>
                <th scope="col" className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {branches.map((b) => (
                <tr key={b.id} data-testid="admin-branch-row">
                  <td className="px-4 py-3">
                    <Link href={`/admin/branches/${b.id}`} className="font-semibold text-brand-700 hover:underline">
                      {b.name}
                    </Link>
                    {b.isAirport ? <Badge tone="info" className="ml-2">Airport</Badge> : null}
                  </td>
                  <td className="px-4 py-3 font-mono">{b.code}</td>
                  <td className="px-4 py-3">{b.city}</td>
                  <td className="px-4 py-3">{b.timeZone}</td>
                  <td className="px-4 py-3 text-xs">{b.openingHoursText}</td>
                  <td className="px-4 py-3">{b.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Card>
        <CardHeader title="Add a branch" />
        <CardBody>
          <ActionForm action={createBranchAction} submitLabel="Create branch" submitTestId="branch-submit" ariaLabel="New branch">
            <BranchFields />
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
