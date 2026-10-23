import Stripe from "stripe";
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

/**
 * Stripe (test mode) adapter. Selected with PAYMENT_PROVIDER=stripe; not used locally.
 * - Rental charge: PaymentIntent confirmed immediately (automatic capture).
 * - Security deposit: PaymentIntent with capture_method=manual (an authorisation hold);
 *   release = cancel the intent, capture = capture `amount_to_capture` (rest is released).
 * - `paymentMethod` is a Stripe PaymentMethod id (e.g. pm_card_visa in test mode) collected by
 *   Stripe Elements on the client.
 * - Webhooks: payment_intent.* and charge.refunded are mapped onto our provider-neutral events;
 *   metadata.kind tells payments and deposits apart.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly signatureHeader = "stripe-signature";
  private readonly stripe: Stripe;

  constructor(private readonly options: { secretKey: string; webhookSecret: string }) {
    if (!options.secretKey.startsWith("sk_test_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
      throw new Error("Refusing to use a non-test Stripe key (set STRIPE_ALLOW_LIVE=true to override)");
    }
    this.stripe = new Stripe(options.secretKey);
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    const intent = await this.wrap(() =>
      this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          payment_method: input.paymentMethod,
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          metadata: { reference: input.reference, kind: "payment" },
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    return toPayment(intent);
  }

  async cancelPayment(paymentId: string): Promise<Payment> {
    const intent = await this.wrap(() => this.stripe.paymentIntents.cancel(paymentId));
    return toPayment(intent);
  }

  async refundPayment(paymentId: string, amountCents?: number): Promise<Payment> {
    await this.wrap(() =>
      this.stripe.refunds.create({ payment_intent: paymentId, ...(amountCents ? { amount: amountCents } : {}) }),
    );
    const intent = await this.wrap(() => this.stripe.paymentIntents.retrieve(paymentId, { expand: ["latest_charge"] }));
    return toPayment(intent);
  }

  async holdDeposit(input: HoldDepositInput): Promise<Deposit> {
    const intent = await this.wrap(() =>
      this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          payment_method: input.paymentMethod,
          capture_method: "manual",
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
          metadata: { reference: input.reference, kind: "deposit" },
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    return toDeposit(intent);
  }

  async releaseDeposit(depositId: string): Promise<Deposit> {
    const intent = await this.wrap(() => this.stripe.paymentIntents.cancel(depositId));
    return toDeposit(intent);
  }

  async captureDeposit(depositId: string, amountCents?: number): Promise<Deposit> {
    const intent = await this.wrap(() =>
      this.stripe.paymentIntents.capture(depositId, amountCents ? { amount_to_capture: amountCents } : {}),
    );
    return toDeposit(intent);
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): PaymentWebhookEvent {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signatureHeader ?? "", this.options.webhookSecret);
    } catch {
      throw new PaymentError("Webhook signature does not match", "invalid_signature");
    }
    const createdAt = new Date(event.created * 1000).toISOString();
    const obj = event.data.object as unknown as Record<string, unknown>;
    const intent = (event.type.startsWith("charge.") ? null : obj) as Stripe.PaymentIntent | null;
    const kind = (intent?.metadata?.kind ?? (obj.metadata as Record<string, string> | undefined)?.kind) as
      | "payment"
      | "deposit"
      | undefined;

    let type: PaymentEventType | null = null;
    let data: Payment | Deposit | null = null;
    switch (event.type) {
      case "payment_intent.succeeded":
        type = kind === "deposit" ? "deposit.captured" : "payment.succeeded";
        break;
      case "payment_intent.amount_capturable_updated":
        type = "deposit.held";
        break;
      case "payment_intent.payment_failed":
        type = kind === "deposit" ? "deposit.failed" : "payment.failed";
        break;
      case "payment_intent.canceled":
        type = kind === "deposit" ? "deposit.released" : "payment.canceled";
        break;
      case "charge.refunded": {
        const charge = obj as unknown as Stripe.Charge;
        type = "payment.refunded";
        data = {
          id: typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? ""),
          reference: charge.metadata?.reference ?? "",
          amountCents: charge.amount,
          refundedCents: charge.amount_refunded,
          currency: charge.currency,
          status: charge.amount_refunded >= charge.amount ? "refunded" : "partially_refunded",
          createdAt,
        };
        break;
      }
    }
    if (!type) {
      // Unhandled event types are acknowledged by the webhook handler and ignored.
      return { id: event.id, type: "ignored", createdAt, data: {} as Payment };
    }
    if (!data && intent) data = type.startsWith("deposit.") ? toDeposit(intent) : toPayment(intent);
    return { id: event.id, type, createdAt, data: data! };
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Stripe.errors.StripeCardError) {
        // Card declines are returned as a failed payment by the caller's state, not thrown.
        const intent = (err.raw as { payment_intent?: Stripe.PaymentIntent }).payment_intent;
        if (intent) return intent as unknown as T;
      }
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") {
        throw new PaymentError(err.message, "not_found");
      }
      throw err;
    }
  }
}

function toPayment(intent: Stripe.PaymentIntent): Payment {
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const refunded = charge?.amount_refunded ?? 0;
  let status: Payment["status"];
  if (intent.status === "succeeded") {
    status = refunded === 0 ? "succeeded" : refunded >= intent.amount ? "refunded" : "partially_refunded";
  } else if (intent.status === "canceled") status = "canceled";
  else status = "failed"; // requires_payment_method / requires_action (3DS not supported in this flow)
  return {
    id: intent.id,
    reference: intent.metadata?.reference ?? "",
    amountCents: intent.amount,
    refundedCents: refunded,
    currency: intent.currency,
    status,
    failureReason: intent.last_payment_error?.code ?? (status === "failed" ? intent.status : undefined),
    createdAt: new Date(intent.created * 1000).toISOString(),
  };
}

function toDeposit(intent: Stripe.PaymentIntent): Deposit {
  let status: Deposit["status"];
  if (intent.status === "requires_capture") status = "held";
  else if (intent.status === "succeeded") status = "captured";
  else if (intent.status === "canceled") status = "released";
  else status = "failed";
  return {
    id: intent.id,
    reference: intent.metadata?.reference ?? "",
    amountCents: intent.amount,
    capturedCents: intent.amount_received ?? 0,
    currency: intent.currency,
    status,
    failureReason: intent.last_payment_error?.code ?? undefined,
    createdAt: new Date(intent.created * 1000).toISOString(),
  };
}
