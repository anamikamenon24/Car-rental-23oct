import { describe, expect, it } from "vitest";
import { FAKE_PAYMENT_METHODS, FAKE_SIGNATURE_HEADER, FakePaymentProvider, signWebhook } from "./fake";
import type { PaymentWebhookEvent } from "./types";

const secret = "test-secret";

function setup(duplicateDeliveries = 0) {
  const delivered: { body: string; headers: Record<string, string> }[] = [];
  const provider = new FakePaymentProvider({
    webhookSecret: secret,
    webhookUrl: "http://localhost/webhook",
    duplicateDeliveries,
    deliver: async (_url, body, headers) => {
      delivered.push({ body, headers });
    },
  });
  const events = () => delivered.map((d) => JSON.parse(d.body) as PaymentWebhookEvent);
  return { provider, delivered, events };
}

const pay = (paymentMethod: string, idempotencyKey = crypto.randomUUID()) => ({
  amountCents: 12_000,
  currency: "GBP",
  reference: "booking_1",
  idempotencyKey,
  paymentMethod,
});

describe("FakePaymentProvider", () => {
  it("succeeds, fails and cancels by test payment method", async () => {
    const { provider, events } = setup();
    expect((await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed))).status).toBe("succeeded");
    expect((await provider.createPayment(pay(FAKE_PAYMENT_METHODS.fail))).status).toBe("failed");
    expect((await provider.createPayment(pay(FAKE_PAYMENT_METHODS.cancel))).status).toBe("canceled");
    expect(events().map((e) => e.type)).toEqual(["payment.succeeded", "payment.failed", "payment.canceled"]);
  });

  it("does not charge twice for the same idempotency key", async () => {
    const { provider, events } = setup();
    const a = await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed, "key-1"));
    const b = await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed, "key-1"));
    expect(b.id).toBe(a.id);
    expect(events()).toHaveLength(1);
  });

  it("refunds partially then fully, and refuses to over-refund", async () => {
    const { provider } = setup();
    const p = await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed));
    expect((await provider.refundPayment(p.id, 2_000)).status).toBe("partially_refunded");
    await expect(provider.refundPayment(p.id, 20_000)).rejects.toThrow(/exceeds/);
    const full = await provider.refundPayment(p.id);
    expect(full).toMatchObject({ status: "refunded", refundedCents: 12_000 });
  });

  it("holds, releases and captures deposits", async () => {
    const { provider, events } = setup();
    const d1 = await provider.holdDeposit(pay(FAKE_PAYMENT_METHODS.succeed));
    expect(d1.status).toBe("held");
    expect((await provider.releaseDeposit(d1.id)).status).toBe("released");

    const d2 = await provider.holdDeposit(pay(FAKE_PAYMENT_METHODS.succeed));
    expect(await provider.captureDeposit(d2.id, 5_000)).toMatchObject({ status: "captured", capturedCents: 5_000 });
    await expect(provider.releaseDeposit(d2.id)).rejects.toThrow(/captured/);

    expect((await provider.holdDeposit(pay(FAKE_PAYMENT_METHODS.fail))).status).toBe("failed");
    expect(events().map((e) => e.type)).toEqual([
      "deposit.held",
      "deposit.released",
      "deposit.held",
      "deposit.captured",
      "deposit.failed",
    ]);
  });

  it("sends duplicate webhooks with the same event id", async () => {
    const { provider, events } = setup(2);
    await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed));
    const ids = events().map((e) => e.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);

    await provider.redeliver(ids[0]);
    expect(events()).toHaveLength(4);
  });

  it("signs webhooks and rejects tampered or unsigned ones", async () => {
    const { provider, delivered } = setup();
    await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed));
    const { body, headers } = delivered[0];

    expect(provider.verifyWebhook(body, headers[FAKE_SIGNATURE_HEADER]).type).toBe("payment.succeeded");
    expect(() => provider.verifyWebhook(body.replace("12000", "1"), headers[FAKE_SIGNATURE_HEADER])).toThrow();
    expect(() => provider.verifyWebhook(body, null)).toThrow();
    const old = signWebhook(body, secret, Math.floor(Date.now() / 1000) - 3600);
    expect(() => provider.verifyWebhook(body, old)).toThrow(/too old/);
  });

  it("records failed deliveries without undoing the payment", async () => {
    const provider = new FakePaymentProvider({
      webhookSecret: secret,
      webhookUrl: "http://localhost/webhook",
      deliver: async () => {
        throw new Error("down");
      },
    });
    const p = await provider.createPayment(pay(FAKE_PAYMENT_METHODS.succeed));
    expect(p.status).toBe("succeeded");
    expect(provider.listDeliveryErrors()).toHaveLength(1);
  });
});
