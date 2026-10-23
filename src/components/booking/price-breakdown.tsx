import type { Quote } from "@/server/quotes";
import { formatAED, pluralize } from "@/lib/ui/format";
import { cn } from "@/lib/ui/cn";

/**
 * Renders a server-calculated quote. Every number comes from the pricing service; nothing is
 * computed here except display formatting.
 */
export function PriceBreakdown({
  quote,
  className,
  title = "Price breakdown",
  showDeposit = true,
}: {
  quote: Quote;
  className?: string;
  title?: string;
  showDeposit?: boolean;
}) {
  const vatPercent = quote.vatRateBps / 100;
  return (
    <section aria-labelledby="price-breakdown-title" className={cn("text-sm", className)} data-testid="price-breakdown">
      <h2 id="price-breakdown-title" className="text-base font-semibold text-ink-900">
        {title}
      </h2>
      <dl className="mt-3 space-y-2">
        <Row label="Daily rate" testId="price-daily-rate">
          {formatAED(quote.dailyRateFils)}
        </Row>
        <Row label="Rental days" testId="price-days">
          {pluralize(quote.days, "day")}
        </Row>
        <Row label={`Rental (${quote.days} × ${formatAED(quote.dailyRateFils)})`}>{formatAED(quote.rentalFils)}</Row>

        <div className="pt-1">
          <Row label="Extras" testId="price-extras">
            {formatAED(quote.extrasFils)}
          </Row>
          {quote.extras.length > 0 ? (
            <ul className="mt-1 space-y-1 border-l-2 border-ink-100 pl-3 text-ink-600">
              {quote.extras.map((e) => (
                <li key={e.extraId} className="flex justify-between gap-3" data-testid={`price-extra-${e.code}`}>
                  <span>
                    {e.name}
                    {e.quantity > 1 ? ` × ${e.quantity}` : ""}
                    <span className="text-ink-400">
                      {" "}
                      ({formatAED(e.unitFils)}
                      {e.chargeType === "PER_DAY" ? "/day" : " per rental"})
                    </span>
                  </span>
                  <span>{formatAED(e.totalFils)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Row label="One-way fee" testId="price-one-way-fee">
          {formatAED(quote.oneWayFeeFils)}
        </Row>
        <div className="border-t border-ink-100 pt-2">
          <Row label="Subtotal">{formatAED(quote.subtotalFils)}</Row>
        </div>
        <Row label={`VAT (${vatPercent}%)`} testId="price-vat">
          {formatAED(quote.vatFils)}
        </Row>
        <div className="flex items-baseline justify-between gap-4 border-t border-ink-200 pt-3">
          <dt className="text-base font-semibold text-ink-900">Total to pay</dt>
          <dd className="text-xl font-bold text-brand-800" data-testid="price-total">
            {formatAED(quote.totalFils)}
          </dd>
        </div>
      </dl>
      {showDeposit ? (
        <div className="mt-4 rounded-xl bg-brand-50 px-3 py-2.5 text-brand-900">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">Refundable security deposit</span>
            <span className="font-semibold" data-testid="price-deposit">
              {formatAED(quote.depositFils)}
            </span>
          </div>
          <p className="mt-1 text-xs text-brand-800">
            Pre-authorised on your card at payment, not charged. Released after the car is returned in good
            condition.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-600">{label}</dt>
      <dd className="font-medium text-ink-900" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}
