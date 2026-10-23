// Provider-neutral payment contract. The app only talks to this interface;
// PAYMENT_PROVIDER picks the implementation (see ./index.ts).

export type PaymentStatus = "succeeded" | "failed" | "canceled" | "refunded" | "partially_refunded";
export type DepositStatus = "held" | "released" | "captured" | "failed";

export interface Payment {
  id: string;
  reference: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  status: PaymentStatus;
  failureReason?: string;
  createdAt: string;
}

export interface Deposit {
  id: string;
  reference: string;
  amountCents: number;
  capturedCents: number;
  currency: string;
  status: DepositStatus;
  failureReason?: string;
  createdAt: string;
}

export interface CreatePaymentInput {
  amountCents: number;
  currency: string;
  /** Our own id for the thing being paid for, e.g. a booking id. */
  reference: string;
  /** Same key + same provider = same result, never a second charge. */
  idempotencyKey: string;
  /** Provider payment method token. The fake provider reads test tokens from FAKE_PAYMENT_METHODS. */
  paymentMethod: string;
}

export type HoldDepositInput = CreatePaymentInput;

export type PaymentEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.canceled"
  | "payment.refunded"
  | "deposit.held"
  | "deposit.failed"
  | "deposit.released"
  | "deposit.captured"
  /** Provider event we do not act on (acknowledged and recorded only). */
  | "ignored";

export interface PaymentWebhookEvent {
  /** Stable per event. Duplicate deliveries reuse it, so handlers must dedupe on it. */
  id: string;
  type: PaymentEventType;
  createdAt: string;
  data: Payment | Deposit;
}

export interface PaymentProvider {
  readonly name: string;
  /** HTTP header that carries the webhook signature (e.g. "fake-signature", "stripe-signature"). */
  readonly signatureHeader: string;
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  cancelPayment(paymentId: string): Promise<Payment>;
  /** Omit amountCents for a full refund. */
  refundPayment(paymentId: string, amountCents?: number): Promise<Payment>;
  holdDeposit(input: HoldDepositInput): Promise<Deposit>;
  releaseDeposit(depositId: string): Promise<Deposit>;
  /** Keep some or all of a held deposit (e.g. damage). The rest is released. */
  captureDeposit(depositId: string, amountCents?: number): Promise<Deposit>;
  /** Throws if the signature is missing, wrong or too old. */
  verifyWebhook(rawBody: string, signatureHeader: string | null): PaymentWebhookEvent;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_state" | "invalid_amount" | "invalid_signature",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
