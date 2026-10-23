import { FakePaymentProvider } from "./fake";
import type { PaymentProvider } from "./types";

export * from "./types";

const globalForPayments = globalThis as unknown as { paymentProvider?: PaymentProvider };

/**
 * Returns the configured payment provider. Switching to a real provider is a settings change
 * (PAYMENT_PROVIDER plus its keys) once its adapter is added to the switch below.
 */
export function getPaymentProvider(): PaymentProvider {
  // Kept on globalThis so dev-server hot reloads don't wipe the fake provider's in-memory state.
  globalForPayments.paymentProvider ??= createPaymentProvider();
  return globalForPayments.paymentProvider;
}

function createPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER ?? "fake";
  switch (provider) {
    case "fake":
      return new FakePaymentProvider({
        webhookSecret: requireEnv("PAYMENTS_WEBHOOK_SECRET"),
        webhookUrl: process.env.FAKE_PAYMENTS_WEBHOOK_URL || undefined,
        duplicateDeliveries: Number(process.env.FAKE_PAYMENTS_DUPLICATE_DELIVERIES ?? 0),
      });
    default:
      throw new Error(`PAYMENT_PROVIDER "${provider}" has no adapter yet`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
