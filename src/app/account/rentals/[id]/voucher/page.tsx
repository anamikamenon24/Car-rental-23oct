import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/server/auth";
import { getVoucher } from "@/server/reservations";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/spinner";
import { ReservationStatusBadge } from "@/components/ui/status-badge";
import { Logo } from "@/components/layout/logo";
import { PrintButton } from "@/components/rentals/print-button";
import { formatAED, formatDateTime, zoneLabel } from "@/lib/ui/format";
import { one } from "@/lib/ui/search-params";
import { attempt } from "../../../../_lib/errors";

export const metadata: Metadata = { title: "Pick-up voucher" };

export default function VoucherPage({ params, searchParams }: PageProps<"/account/rentals/[id]/voucher">) {
  return (
    <Suspense fallback={<PageLoading label="Loading voucher…" />}>
      <Voucher params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Voucher({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const user = await requireUser(`/account/rentals/${id}/voucher`);
  const found = await attempt(() => getVoucher(user, id));
  if (!found.ok) {
    if (found.error.code === "NOT_FOUND") notFound();
    return (
      <div className="py-10">
        <Alert
          tone="warning"
          title="No voucher yet"
          action={<ButtonLink href={`/account/rentals/${id}`}>Back to booking</ButtonLink>}
        >
          {found.error.message}
        </Alert>
      </div>
    );
  }
  const { reference, qrDataUrl, reservation: r } = found.data;
  const extras = r.quote.extras;

  return (
    <div className="py-8 print:py-0">
      {one(sp.paid) ? (
        <Alert tone="success" title="Payment successful — your car is booked!" className="no-print mb-6" data-testid="payment-success">
          A refundable deposit of {formatAED(r.depositFils)} is held on your card. Show this voucher at the branch.
        </Alert>
      ) : null}

      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/account/rentals/${r.id}`} className="text-sm font-medium text-brand-700 hover:underline">
          ← Booking details
        </Link>
        <PrintButton />
      </div>

      <article
        aria-labelledby="voucher-title"
        data-testid="voucher"
        className="print-plain mx-auto max-w-3xl overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-card)] print:max-w-none print:rounded-none"
      >
        <header className="flex flex-wrap items-center justify-between gap-4 bg-brand-900 px-6 py-5 text-white print:bg-white print:text-ink-900 print:border-b print:border-ink-300">
          <span className="print:hidden">
            <Logo inverted />
          </span>
          <span className="hidden print:inline">
            <Logo />
          </span>
          <div className="text-right">
            <h1 id="voucher-title" className="text-sm font-semibold uppercase tracking-wider text-accent-300 print:text-ink-600">
              Pick-up voucher
            </h1>
            <p className="font-mono text-2xl font-bold" data-testid="voucher-reference">
              {reference}
            </p>
          </div>
        </header>

        <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <ReservationStatusBadge status={r.status} />
              <span className="text-sm text-ink-600">Lead driver: {user.name}</span>
            </div>
            <div>
              <p className="text-sm text-ink-500">Vehicle</p>
              <p className="text-lg font-semibold text-ink-900">
                {r.vehicle.make} {r.vehicle.model} {r.vehicle.year}
              </p>
              <p className="text-sm text-ink-600">{r.vehicle.categoryName} or similar</p>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-ink-500">Pick-up</dt>
                <dd className="font-semibold text-ink-900">{formatDateTime(r.pickupAt, r.pickupBranch.timeZone)}</dd>
                <dd className="text-xs text-ink-500">{zoneLabel(r.pickupBranch.timeZone, r.pickupAt)} local time</dd>
                <dd className="mt-1 text-sm text-ink-800">{r.pickupBranch.name}</dd>
                <dd className="text-sm text-ink-600">{r.pickupBranch.address}</dd>
                {r.pickupBranch.phone ? <dd className="text-sm text-ink-600">{r.pickupBranch.phone}</dd> : null}
              </div>
              <div>
                <dt className="text-sm text-ink-500">Return</dt>
                <dd className="font-semibold text-ink-900">{formatDateTime(r.returnAt, r.returnBranch.timeZone)}</dd>
                <dd className="text-xs text-ink-500">{zoneLabel(r.returnBranch.timeZone, r.returnAt)} local time</dd>
                <dd className="mt-1 text-sm text-ink-800">{r.returnBranch.name}</dd>
                <dd className="text-sm text-ink-600">{r.returnBranch.address}</dd>
              </div>
            </dl>
            {extras.length > 0 ? (
              <div>
                <p className="text-sm text-ink-500">Extras</p>
                <ul className="mt-1 text-sm text-ink-800">
                  {extras.map((e) => (
                    <li key={e.extraId}>
                      {e.name}
                      {e.quantity > 1 ? ` × ${e.quantity}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-2 sm:border-l sm:border-dashed sm:border-ink-200 sm:pl-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated server-side */}
            <img
              src={qrDataUrl}
              alt={`QR code for reservation ${reference}`}
              width={200}
              height={200}
              data-testid="voucher-qr"
              className="size-[200px]"
            />
            <p className="max-w-[200px] text-center text-xs text-ink-500">Staff scan this code at the counter.</p>
          </div>
        </div>

        <footer className="grid gap-4 border-t border-ink-100 bg-ink-50 px-6 py-4 text-sm sm:grid-cols-3 print:bg-white">
          <p>
            <span className="block text-ink-500">Paid</span>
            <span className="font-semibold text-ink-900">{formatAED(r.paidFils)}</span>
          </p>
          <p>
            <span className="block text-ink-500">Deposit hold</span>
            <span className="font-semibold text-ink-900">{formatAED(r.depositFils)}</span>
          </p>
          <p>
            <span className="block text-ink-500">Bring with you</span>
            <span className="text-ink-800">Driving licence, Emirates ID or passport, and the payment card.</span>
          </p>
        </footer>
      </article>
    </div>
  );
}
