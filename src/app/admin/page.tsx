import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/server/auth";
import { adminDashboard } from "@/server/admin/dashboard";
import { PageHeader } from "@/components/ui/page";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReservationSearchForm } from "@/components/admin/reservation-search-form";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Today's operations across all branches (Asia/Dubai)." />
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

async function Dashboard() {
  const actor = await requireAdmin("/admin");
  const d = await adminDashboard(actor);
  const tiles = [
    { label: "Pick-ups today", value: d.pickupsToday, href: "/admin/reservations?status=CONFIRMED" },
    { label: "Returns due today", value: d.returnsToday, href: "/admin/reservations?status=PICKED_UP" },
    { label: "Overdue returns", value: d.overdue, href: "/admin/reservations?status=PICKED_UP", alert: d.overdue > 0 },
    { label: "On rent now", value: d.activeRentals, href: "/admin/reservations?status=PICKED_UP" },
    { label: "Upcoming bookings", value: d.upcoming, href: "/admin/reservations?status=CONFIRMED" },
    { label: "Unpaid holds", value: d.pendingHolds, href: "/admin/reservations?status=PENDING" },
    { label: "Open damage reports", value: d.openDamageReports, href: "/admin/damage?status=OPEN", alert: d.openDamageReports > 0 },
  ];
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Find a reservation" description="Reference, customer name or email, or plate. Scanning a voucher QR lands here too." />
        <CardBody>
          <ReservationSearchForm />
        </CardBody>
      </Card>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Today at a glance">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link
              href={t.href}
              className="block rounded-2xl border border-ink-200 bg-white p-4 shadow-[var(--shadow-card)] hover:border-brand-300"
              data-testid="dashboard-tile"
            >
              <span className="text-sm text-ink-600">{t.label}</span>
              <span className={`mt-1 block text-3xl font-bold ${t.alert ? "text-red-700" : "text-ink-900"}`}>{t.value}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader title="Fleet status" action={<Link href="/admin/fleet" className="text-sm font-semibold text-brand-700 hover:underline">Manage fleet</Link>} />
        <CardBody className="flex flex-wrap gap-3">
          {Object.keys(d.fleetByStatus).length === 0 ? (
            <p className="text-sm text-ink-600">No vehicles yet.</p>
          ) : (
            Object.entries(d.fleetByStatus).map(([status, count]) => (
              <Link key={status} href={`/admin/fleet?status=${status}`} className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 hover:border-brand-300">
                <StatusBadge status={status} />
                <span className="font-semibold">{count}</span>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
