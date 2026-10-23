import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  PaymentError,
  type CreatePaymentInput,
  type Deposit,
  type HoldDepositInput,
  type Payment,
  type PaymentEventType,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from "./types";

/** Test payment method tokens. Anything else is treated as a declined card. */
export const FAKE_PAYMENT_METHODS = {
  succeed: "pm_fake_success",
  fail: "pm_fake_declined",
  cancel: "pm_fake_canceled",
} as const;

export const FAKE_SIGNATURE_HEADER = "fake-signature";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export type WebhookDeliverer = (url: string, body: string, headers: Record<string, string>) => Promise<void>;

export interface FakePaymentOptions {
  webhookSecret: string;
  /** Where events are POSTed. Leave empty to only record them (see listEvents). */
  webhookUrl?: string;
  /** Extra copies of every webhook, to test duplicate handling. 0 = send once. */
  duplicateDeliveries?: number;
  deliver?: WebhookDeliverer;
  now?: () => Date;
}

const httpDeliver: WebhookDeliverer = async (url, body, headers) => {
  const res = await fetch(url, { method: "POST", body, headers });
  if (!res.ok) throw new Error(`Webhook endpoint answered ${res.status}`);
};

export function signWebhook(body: string, secret: string, timestamp: number): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/**
 * In-memory payment provider for local development and tests.
 * Behaves like a card processor: outcomes are chosen by the payment method token,
 * every state change emits a signed webhook, and idempotency keys are honoured.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  readonly signatureHeader = FAKE_SIGNATURE_HEADER;
  private payments = new Map<string, Payment>();
  private deposits = new Map<string, Deposit>();
  private idempotency = new Map<string, string>();
  private events: PaymentWebhookEvent[] = [];
  private deliveryErrors: { eventId: string; error: string }[] = [];
  private readonly deliver: WebhookDeliverer;
  private readonly now: () => Date;

  constructor(private readonly options: FakePaymentOptions) {
    this.deliver = options.deliver ?? httpDeliver;
    this.now = options.now ?? (() => new Date());
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    assertAmount(input.amountCents);
    const existing = this.idempotency.get(`payment:${input.idempotencyKey}`);
    if (existing) return { ...this.payments.get(existing)! };

    const outcome = outcomeFor(input.paymentMethod);
    const payment: Payment = {
      id: `pay_fake_${randomUUID()}`,
      reference: input.reference,
      amountCents: input.amountCents,
      refundedCents: 0,
      currency: input.currency.toLowerCase(),
      status: outcome.status === "ok" ? "succeeded" : outcome.status,
      failureReason: outcome.reason,
      createdAt: this.now().toISOString(),
    };
    this.payments.set(payment.id, payment);
    this.idempotency.set(`payment:${input.idempotencyKey}`, payment.id);
    await this.emit(`payment.${payment.status}` as PaymentEventType, payment);
    return { ...payment };
  }

  async cancelPayment(paymentId: string): Promise<Payment> {
    const payment = this.getPayment(paymentId);
    if (payment.status === "canceled") return { ...payment };
    if (payment.status !== "failed") {
      throw new PaymentError(`Cannot cancel a ${payment.status} payment; refund it instead`, "invalid_state");
    }
    payment.status = "canceled";
    await this.emit("payment.canceled", payment);
    return { ...payment };
  }

  async refundPayment(paymentId: string, amountCents?: number): Promise<Payment> {
    const payment = this.getPayment(paymentId);
    if (payment.status !== "succeeded" && payment.status !== "partially_refunded") {
      throw new PaymentError(`Cannot refund a ${payment.status} payment`, "invalid_state");
    }
    const remaining = payment.amountCents - payment.refundedCents;
    const amount = amountCents ?? remaining;
    assertAmount(amount);
    if (amount > remaining) throw new PaymentError(`Refund exceeds remaining ${remaining}`, "invalid_amount");

    payment.refundedCents += amount;
    payment.status = payment.refundedCents === payment.amountCents ? "refunded" : "partially_refunded";
    await this.emit("payment.refunded", payment);
    return { ...payment };
  }

  async holdDeposit(input: HoldDepositInput): Promise<Deposit> {
    assertAmount(input.amountCents);
    const existing = this.idempotency.get(`deposit:${input.idempotencyKey}`);
    if (existing) return { ...this.deposits.get(existing)! };

    const outcome = outcomeFor(input.paymentMethod);
    const deposit: Deposit = {
      id: `dep_fake_${randomUUID()}`,
      reference: input.reference,
      amountCents: input.amountCents,
      capturedCents: 0,
      currency: input.currency.toLowerCase(),
      status: outcome.status === "ok" ? "held" : "failed",
      failureReason: outcome.reason,
      createdAt: this.now().toISOString(),
    };
    this.deposits.set(deposit.id, deposit);
    this.idempotency.set(`deposit:${input.idempotencyKey}`, deposit.id);
    await this.emit(deposit.status === "held" ? "deposit.held" : "deposit.failed", deposit);
    return { ...deposit };
  }

  async releaseDeposit(depositId: string): Promise<Deposit> {
    const deposit = this.getDeposit(depositId);
    if (deposit.status === "released") return { ...deposit };
    if (deposit.status !== "held") throw new PaymentError(`Cannot release a ${deposit.status} deposit`, "invalid_state");
    deposit.status = "released";
    await this.emit("deposit.released", deposit);
    return { ...deposit };
  }

  async captureDeposit(depositId: string, amountCents?: number): Promise<Deposit> {
    const deposit = this.getDeposit(depositId);
    if (deposit.status !== "held") throw new PaymentError(`Cannot capture a ${deposit.status} deposit`, "invalid_state");
    const amount = amountCents ?? deposit.amountCents;
    assertAmount(amount);
    if (amount > deposit.amountCents) throw new PaymentError("Capture exceeds the held amount", "invalid_amount");
    deposit.capturedCents = amount;
    deposit.status = "captured";
    await this.emit("deposit.captured", deposit);
    return { ...deposit };
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): PaymentWebhookEvent {
    const parts = Object.fromEntries((signatureHeader ?? "").split(",").map((p) => p.split("=", 2)));
    const timestamp = Number(parts.t);
    if (!parts.v1 || !Number.isFinite(timestamp)) {
      throw new PaymentError("Missing webhook signature", "invalid_signature");
    }
    if (Math.abs(this.now().getTime() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
      throw new PaymentError("Webhook signature is too old", "invalid_signature");
    }
    const expected = Buffer.from(signWebhook(rawBody, this.options.webhookSecret, timestamp));
    const given = Buffer.from(`t=${parts.t},v1=${parts.v1}`);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new PaymentError("Webhook signature does not match", "invalid_signature");
    }
    return JSON.parse(rawBody) as PaymentWebhookEvent;
  }

  // ---- Test helpers (not part of PaymentProvider) ----

  listEvents(): PaymentWebhookEvent[] {
    return this.events.map((e) => ({ ...e }));
  }

  listDeliveryErrors() {
    return [...this.deliveryErrors];
  }

  /** Send an already-sent event again, exactly as a provider retry would. */
  async redeliver(eventId: string): Promise<void> {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new PaymentError(`No event ${eventId}`, "not_found");
    await this.send(event);
  }

  private async emit(type: PaymentEventType, data: Payment | Deposit) {
    const event: PaymentWebhookEvent = {
      id: `evt_fake_${randomUUID()}`,
      type,
      createdAt: this.now().toISOString(),
      data: { ...data },
    };
    this.events.push(event);
    const copies = 1 + Math.max(0, this.options.duplicateDeliveries ?? 0);
    for (let i = 0; i < copies; i++) await this.send(event);
  }

  private async send(event: PaymentWebhookEvent) {
    if (!this.options.webhookUrl) return;
    const body = JSON.stringify(event);
    const timestamp = Math.floor(this.now().getTime() / 1000);
    try {
      await this.deliver(this.options.webhookUrl, body, {
        "content-type": "application/json",
        [FAKE_SIGNATURE_HEADER]: signWebhook(body, this.options.webhookSecret, timestamp),
      });
    } catch (err) {
      // Like a real provider, a failed delivery never undoes the payment itself.
      this.deliveryErrors.push({ eventId: event.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  private getPayment(id: string): Payment {
    const payment = this.payments.get(id);
    if (!payment) throw new PaymentError(`No payment ${id}`, "not_found");
    return payment;
  }

  private getDeposit(id: string): Deposit {
    const deposit = this.deposits.get(id);
    if (!deposit) throw new PaymentError(`No deposit ${id}`, "not_found");
    return deposit;
  }
}

function outcomeFor(paymentMethod: string): { status: "ok" | "failed" | "canceled"; reason?: string } {
  switch (paymentMethod) {
    case FAKE_PAYMENT_METHODS.succeed:
      return { status: "ok" };
    case FAKE_PAYMENT_METHODS.cancel:
      return { status: "canceled", reason: "customer_canceled" };
    case FAKE_PAYMENT_METHODS.fail:
      return { status: "failed", reason: "card_declined" };
    default:
      return { status: "failed", reason: "unknown_test_payment_method" };
  }
}

function assertAmount(amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new PaymentError("Amount must be a positive whole number of cents", "invalid_amount");
  }
}
