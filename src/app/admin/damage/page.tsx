import type { Metadata } from "next";
import Form from "next/form";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { listDamageReports } from "@/server/admin/damage";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { inputClasses } from "@/components/ui/field";
import { buttonClasses } from "@/components/ui/button";
import { DamageList } from "@/components/admin/damage";
import { one, type RawSearchParams } from "@/lib/ui/search-params";
import { updateDamageAction } from "./actions";

export const metadata: Metadata = { title: "Damage reports · Admin" };

export default function AdminDamagePage({ searchParams }: PageProps<"/admin/damage">) {
  return (
    <>
      <PageHeader
        title="Damage reports"
        description="Reports are created from a reservation (at pick-up or return) or from a vehicle's page."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <DamageReports searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const STATUSES = ["OPEN", "REPAIRED", "WAIVED"] as const;

async function DamageReports({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const sp = await searchParams;
  const actor = await requireAdmin("/admin/damage");
  const raw = one(sp.status);
  const status = STATUSES.find((s) => s === raw);
  const reports = await listDamageReports(actor, { status });
  return (
    <div className="space-y-4">
      <Form action="/admin/damage" className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="damage-filter-status" className="mb-1 block text-sm font-medium">
            Status
          </label>
          <select id="damage-filter-status" name="status" defaultValue={status ?? ""} className={inputClasses}>
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonClasses("outline", "md")}>
          Filter
        </button>
      </Form>
      <Card>
        <CardBody>
          <DamageList reports={reports} timeZone="Asia/Dubai" updateAction={updateDamageAction} />
        </CardBody>
      </Card>
    </div>
  );
}
