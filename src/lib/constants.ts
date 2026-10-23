// Client-safe constants and helpers (no secrets, no server imports). Owned by `db`.

export const CURRENCY = "AED";
/** VAT in basis points: 500 = 5% (UAE). */
export const VAT_RATE_BPS = 500;

/** Test payment method tokens understood by the fake payment provider. */
export const PAYMENT_TEST_METHODS = [
  { token: "pm_fake_success", label: "Test card – payment succeeds", outcome: "success" },
  { token: "pm_fake_declined", label: "Test card – declined", outcome: "declined" },
  { token: "pm_fake_canceled", label: "Test card – customer cancels", outcome: "canceled" },
] as const;

/** Fuel level in eighths of a tank. */
export const FUEL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const fuelLabel = (eighths: number) => (eighths === 8 ? "Full" : eighths === 0 ? "Empty" : `${eighths}/8`);

/** Cancellation policy (implemented in src/server/pricing.ts `cancellationRefund`). */
export const CANCELLATION_POLICY = {
  freeCancellationHours: 48,
  lateCancellationRefundPercent: 50,
  rules: [
    "Free cancellation (100% refund) up to 48 hours before pick-up.",
    "Cancelling less than 48 hours before pick-up refunds 50% of the rental total.",
    "No refund after the pick-up time or once the car has been collected.",
    "Unpaid bookings can be cancelled at any time at no cost.",
    "The security deposit hold is always released in full when a booking is cancelled.",
  ],
} as const;

export const HOLD_MINUTES_DEFAULT = 15;

/** Formats fils as "AED 1,234.50". */
export function formatFils(fils: number, opts: { currency?: boolean } = {}): string {
  const value = (fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return opts.currency === false ? value : `AED ${value}`;
}
