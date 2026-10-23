import { FakePaymentProvider } from "./fake";
import type { PaymentProvider } from "./types";

export * from "./types";

const globalForPayments = globalThis as unknown as { paymentProvider?: PaymentProvider };

/**
 * Returns the configured payment provider (PAYMENT_PROVIDER = fake | stripe; default fake).
 * Settings are read on first use; call resetPaymentProvider() after changing env in tests.
 */
export function getPaymentProvider(): PaymentProvider {
  // Kept on globalThis so dev-server hot reloads don't wipe the fake provider's in-memory state.
  globalForPayments.paymentProvider ??= createPaymentProvider();
  return globalForPayments.paymentProvider;
}

/** Test hook: use this provider instance (e.g. a FakePaymentProvider with a custom deliverer). */
export function setPaymentProvider(provider: PaymentProvider): void {
  globalForPayments.paymentProvider = provider;
}

/** Test hook: forget the cached provider so the next call re-reads env. */
export function resetPaymentProvider(): void {
  globalForPayments.paymentProvider = undefined;
}

function createPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER || "fake";
  switch (provider) {
    case "fake":
      return new FakePaymentProvider({
        webhookSecret: requireEnv("PAYMENTS_WEBHOOK_SECRET"),
        webhookUrl: process.env.FAKE_PAYMENTS_WEBHOOK_URL || undefined,
        duplicateDeliveries: Number(process.env.FAKE_PAYMENTS_DUPLICATE_DELIVERIES ?? 0),
      });
    case "stripe": {
      // Loaded lazily so the Stripe SDK is never pulled in when the fake provider is used.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { StripePaymentProvider } = require("./stripe") as typeof import("./stripe");
      return new StripePaymentProvider({
        secretKey: requireEnv("STRIPE_SECRET_KEY"),
        webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET"),
      });
    }
    default:
      throw new Error(`PAYMENT_PROVIDER "${provider}" has no adapter`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
