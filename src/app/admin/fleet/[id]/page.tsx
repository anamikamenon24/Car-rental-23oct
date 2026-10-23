import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminGetVehicle, listCategoriesAdmin } from "@/server/admin/fleet";
import { adminListBranches } from "@/server/admin/branches";
import { listFeatures } from "@/server/catalog";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionForm, AFSelect, AFText } from "@/components/ui/action-form";
import { VehicleFields } from "@/components/admin/vehicle-fields";
import {
  createMaintenanceAction,
  deleteMaintenanceAction,
  setVehicleStatusAction,
  updateVehicleAction,
} from "../actions";
import { formatDateTime } from "@/lib/ui/format";

export const metadata: Metadata = { title: "Edit vehicle · Fleet · Admin" };

export default function AdminVehiclePage({ params }: PageProps<"/admin/fleet/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mt-8 h-96 w-full rounded-2xl" />}>
      <VehicleDetail params={params} />
    </Suspense>
  );
}

async function VehicleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireAdmin(`/admin/fleet/${id}`);

  let vehicle;
  try {
    vehicle = await adminGetVehicle(actor, id);
  } catch {
    notFound();
  }

  const [categories, branches, features] = await Promise.all([
    listCategoriesAdmin(actor),
    adminListBranches(actor),
    listFeatures(),
  ]);

  const tz = vehicle.branchTimeZone || "Asia/Dubai";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          breadcrumbs={[
            { href: "/admin", label: "Admin" },
            { href: "/admin/fleet", label: "Fleet" },
            { label: `${vehicle.make} ${vehicle.model} (${vehicle.plate})` },
          ]}
        />
        <div className="flex items-center gap-3">
          <StatusBadge status={vehicle.status} />
          {/* Quick status change form */}
          <ActionForm action={setVehicleStatusAction} submitLabel="Update status" submitSize="sm" submitVariant="outline">
            <input type="hidden" name="id" value={vehicle.id} />
            <select
              name="status"
              defaultValue={vehicle.status}
              className="rounded-lg border border-ink-300 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-800 shadow-xs focus:outline-none"
            >
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="ON_RENT">On rent</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="RETIRED">Retired</option>
            </select>
          </ActionForm>
        </div>
      </div>

      {/* Edit vehicle details */}
      <Card>
        <CardHeader title="Vehicle details" description="Update specifications, features, or assigned branch." />
        <CardBody>
          <ActionForm action={updateVehicleAction} submitLabel="Save vehicle" ariaLabel="Edit vehicle">
            <input type="hidden" name="id" value={vehicle.id} />
            <VehicleFields vehicle={vehicle} categories={categories} branches={branches} features={features} />
          </ActionForm>
        </CardBody>
      </Card>

      {/* Maintenance blocks */}
      <Card>
        <CardHeader
          title={`Maintenance blocks (${vehicle.maintenance.length})`}
          description={`Dates the car is out of service. Times shown in ${tz}. Overlapping customer reservations will be blocked.`}
        />
        <CardBody className="space-y-6">
          {vehicle.maintenance.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-ink-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Starts</th>
                    <th scope="col" className="px-4 py-2.5">Ends</th>
                    <th scope="col" className="px-4 py-2.5">Reason</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {vehicle.maintenance.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2.5 text-ink-900">{formatDateTime(m.startsAt, tz)}</td>
                      <td className="px-4 py-2.5 text-ink-900">{formatDateTime(m.endsAt, tz)}</td>
                      <td className="px-4 py-2.5 text-ink-700">{m.reason}</td>
                      <td className="px-4 py-2.5 text-right">
                        <ActionForm action={deleteMaintenanceAction} submitLabel="Delete" submitVariant="ghost" submitSize="sm">
                          <input type="hidden" name="id" value={m.id} />
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-500">No maintenance scheduled for this vehicle.</p>
          )}

          {/* Add maintenance block */}
          <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
            <h4 className="mb-3 text-sm font-semibold text-ink-900">Schedule maintenance block</h4>
            <ActionForm action={createMaintenanceAction} submitLabel="Add block" submitVariant="outline">
              <input type="hidden" name="vehicleId" value={vehicle.id} />
              <input type="hidden" name="timeZone" value={tz} />
              <div className="grid gap-3 sm:grid-cols-3">
                <AFText label="Starts at" name="startsAt" type="datetime-local" required />
                <AFText label="Ends at" name="endsAt" type="datetime-local" required />
                <AFText label="Reason" name="reason" placeholder="e.g. 50k service, bodywork repair" required />
              </div>
            </ActionForm>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
