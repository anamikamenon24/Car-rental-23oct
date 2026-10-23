import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminListBranches } from "@/server/admin/branches";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { ActionForm } from "@/components/ui/action-form";
import { BranchFields } from "@/components/admin/branch-fields";
import { updateBranchAction } from "../actions";

export const metadata: Metadata = { title: "Edit branch · Admin" };

export default function AdminBranchPage({ params }: PageProps<"/admin/branches/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="mt-8 h-96 w-full rounded-2xl" />}>
      <EditBranch params={params} />
    </Suspense>
  );
}

async function EditBranch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireAdmin(`/admin/branches/${id}`);
  const branch = (await adminListBranches(actor)).find((b) => b.id === id);
  if (!branch) notFound();
  return (
    <>
      <PageHeader
        title={branch.name}
        breadcrumbs={[{ href: "/admin", label: "Admin" }, { href: "/admin/branches", label: "Branches" }, { label: branch.name }]}
      />
      <Card>
        <CardBody>
          <ActionForm action={updateBranchAction} submitLabel="Save branch" submitTestId="branch-submit" ariaLabel="Edit branch">
            <input type="hidden" name="id" value={branch.id} />
            <BranchFields branch={branch} />
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
