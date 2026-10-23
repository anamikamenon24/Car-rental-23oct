import type { DepositDto, PaymentDto } from "@/server/reservations";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAED, formatDateTime, humanize } from "@/lib/ui/format";

export function PaymentHistory({
  payments,
  deposits,
  timeZone,
}: {
  payments: PaymentDto[];
  deposits: DepositDto[];
  timeZone: string;
}) {
  if (payments.length === 0 && deposits.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Payments and deposit" />
      <CardBody className="space-y-4">
        {payments.length > 0 ? (
          <ul className="divide-y divide-ink-100 text-sm" aria-label="Payments">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="payment-row">
                <span>
                  {humanize(p.kind)} payment · attempt {p.attempt}
                  <span className="block text-xs text-ink-500">{formatDateTime(p.createdAt, timeZone)}</span>
                  {p.failureReason ? <span className="block text-xs text-red-700">{p.failureReason}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatAED(p.amountFils)}</span>
                  {p.refundedFils > 0 ? (
                    <span className="text-xs text-ink-500">refunded {formatAED(p.refundedFils)}</span>
                  ) : null}
                  <StatusBadge status={p.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {deposits.length > 0 ? (
          <ul className="divide-y divide-ink-100 text-sm" aria-label="Deposit">
            {deposits.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="deposit-row">
                <span>
                  Security deposit hold
                  <span className="block text-xs text-ink-500">{formatDateTime(d.createdAt, timeZone)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{formatAED(d.amountFils)}</span>
                  {d.capturedFils > 0 ? (
                    <span className="text-xs text-ink-500">kept {formatAED(d.capturedFils)}</span>
                  ) : null}
                  <StatusBadge status={d.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}
