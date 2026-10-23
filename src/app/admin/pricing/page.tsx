import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminListExtras, listPricingRules } from "@/server/admin/pricing";
import { listCategoriesAdmin } from "@/server/admin/fleet";
import { adminListBranches } from "@/server/admin/branches";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { ActionForm, AFCheckbox, AFSelect, AFText } from "@/components/ui/action-form";
import { formatAED } from "@/lib/ui/format";
import {
  createExtraAction,
  createPricingRuleAction,
  deletePricingRuleAction,
} from "./actions";

export const metadata: Metadata = { title: "Pricing & extras · Admin" };

export default function AdminPricingPage() {
  return (
    <>
      <PageHeader
        title="Pricing & extras"
        description="Daily rental rates, seasonal overrides, and add-on extras."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <PricingView />
      </Suspense>
    </>
  );
}

async function PricingView() {
  const actor = await requireAdmin("/admin/pricing");
  const [rules, extrasList, categories, branches] = await Promise.all([
    listPricingRules(actor),
    adminListExtras(actor),
    listCategoriesAdmin(actor),
    adminListBranches(actor),
  ]);

  return (
    <div className="space-y-8">
      {/* Pricing rules table */}
      <Card>
        <CardHeader
          title={`Pricing rules (${rules.length})`}
          description="Rules match customer dates and category. Higher priority rules take precedence."
        />
        <CardBody className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Rule name</th>
                  <th scope="col" className="px-4 py-2.5">Category</th>
                  <th scope="col" className="px-4 py-2.5">Branch</th>
                  <th scope="col" className="px-4 py-2.5">Rate / day</th>
                  <th scope="col" className="px-4 py-2.5">Min days</th>
                  <th scope="col" className="px-4 py-2.5">Valid dates</th>
                  <th scope="col" className="px-4 py-2.5">Priority</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{r.name}</td>
                    <td className="px-4 py-2.5 text-ink-700">{r.categoryName}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.branchName ?? "All branches"}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink-900">{formatAED(r.dailyRateFils)}</td>
                    <td className="px-4 py-2.5 text-ink-600">{r.minDays}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {r.validFrom || r.validTo ? `${r.validFrom ?? "Any"} → ${r.validTo ?? "Any"}` : "Always"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.priority}</td>
                    <td className="px-4 py-2.5">
                      {r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ActionForm action={deletePricingRuleAction} submitLabel="Delete" submitVariant="ghost" submitSize="sm">
                        <input type="hidden" name="id" value={r.id} />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700 hover:underline">
              + Add new pricing rule
            </summary>
            <div className="mt-4">
              <ActionForm action={createPricingRuleAction} submitLabel="Create pricing rule">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <AFText label="Rule name" name="name" placeholder="e.g. Standard Daily" required />
                  <AFSelect label="Category" name="categoryId" required>
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </AFSelect>
                  <AFSelect label="Branch" name="branchId">
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </AFSelect>
                  <AFText label="Daily rate (AED)" name="dailyRateFils" type="number" min="1" step="0.01" placeholder="e.g. 150" required />
                  <AFText label="Minimum rental days" name="minDays" type="number" min="1" defaultValue="1" required />
                  <AFText label="Valid from" name="validFrom" type="date" />
                  <AFText label="Valid to" name="validTo" type="date" />
                  <AFText label="Priority" name="priority" type="number" defaultValue="0" hint="Higher numbers take precedence" />
                </div>
                <div className="mt-2">
                  <AFCheckbox label="Active rule" name="isActive" defaultChecked={true} />
                </div>
              </ActionForm>
            </div>
          </details>
        </CardBody>
      </Card>

      {/* Extras table */}
      <Card>
        <CardHeader
          title={`Rental extras (${extrasList.length})`}
          description="Add-on items customers can choose during booking (child seats, GPS, insurance)."
        />
        <CardBody className="space-y-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Extra</th>
                  <th scope="col" className="px-4 py-2.5">Code</th>
                  <th scope="col" className="px-4 py-2.5">Charge type</th>
                  <th scope="col" className="px-4 py-2.5">Price</th>
                  <th scope="col" className="px-4 py-2.5">Max charge</th>
                  <th scope="col" className="px-4 py-2.5">Max qty</th>
                  <th scope="col" className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {extrasList.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5 font-medium text-ink-900">
                      {e.name}
                      {e.description && <span className="block text-xs text-ink-500">{e.description}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600">{e.code}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-700">
                      {e.chargeType === "PER_DAY" ? "Per day" : "Per rental"}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-ink-900">{formatAED(e.priceFils)}</td>
                    <td className="px-4 py-2.5 text-ink-600">
                      {e.maxChargeFils ? formatAED(e.maxChargeFils) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-ink-600">{e.maxQuantity}</td>
                    <td className="px-4 py-2.5">
                      {e.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-xl border border-ink-200 bg-ink-50/50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700 hover:underline">
              + Add new rental extra
            </summary>
            <div className="mt-4">
              <ActionForm action={createExtraAction} submitLabel="Create extra">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <AFText label="Name" name="name" placeholder="e.g. Full Comprehensive Insurance" required />
                  <AFText label="Code" name="code" placeholder="e.g. FULL_INSURANCE" hint="2-30 uppercase chars" required />
                  <AFSelect label="Charge type" name="chargeType" required>
                    <option value="PER_DAY">Per day</option>
                    <option value="PER_RENTAL">Per rental</option>
                  </AFSelect>
                  <AFText label="Price (AED)" name="priceFils" type="number" min="0" step="0.01" placeholder="e.g. 50" required />
                  <AFText label="Max charge (AED, optional)" name="maxChargeFils" type="number" min="0" step="0.01" />
                  <AFText label="Max quantity" name="maxQuantity" type="number" min="1" max="10" defaultValue="1" required />
                  <AFText label="Display order" name="sortOrder" type="number" defaultValue="0" />
                </div>
                <AFText label="Description" name="description" placeholder="Brief explanation shown to customers" />
                <div className="mt-2">
                  <AFCheckbox label="Active extra" name="isActive" defaultChecked={true} />
                </div>
              </ActionForm>
            </div>
          </details>
        </CardBody>
      </Card>
    </div>
  );
}
