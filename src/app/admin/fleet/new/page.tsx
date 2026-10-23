import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { listCategoriesAdmin } from "@/server/admin/fleet";
import { adminListBranches } from "@/server/admin/branches";
import { listFeatures } from "@/server/catalog";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { ActionForm } from "@/components/ui/action-form";
import { VehicleFields } from "@/components/admin/vehicle-fields";
import { createVehicleAction } from "../actions";

export const metadata: Metadata = { title: "Add vehicle · Fleet · Admin" };

export default function NewVehiclePage() {
  return (
    <>
      <PageHeader
        title="Add new vehicle"
        breadcrumbs={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/fleet", label: "Fleet" },
          { label: "New vehicle" },
        ]}
      />
      <Suspense fallback={<Skeleton className="mt-8 h-96 w-full rounded-2xl" />}>
        <NewVehicleForm />
      </Suspense>
    </>
  );
}

async function NewVehicleForm() {
  const actor = await requireAdmin("/admin/fleet/new");
  const [categories, branches, features] = await Promise.all([
    listCategoriesAdmin(actor),
    adminListBranches(actor),
    listFeatures(),
  ]);

  return (
    <Card>
      <CardBody>
        <ActionForm action={createVehicleAction} submitLabel="Create vehicle" ariaLabel="Add vehicle">
          <VehicleFields categories={categories} branches={branches} features={features} />
        </ActionForm>
      </CardBody>
    </Card>
  );
}
