// Q8: payment success, failure, cancellation, retry, idempotency, refund, deposit release,
// duplicate webhook delivery (single state change) and bad-signature rejection.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "../helpers/db";
import { loadTestEnv } from "../helpers/env";
import { closeTestPool, dubai, makeWorld, newKey, testPool, type World } from "../helpers/world";

const { FakePaymentProvider, signWebhook, FAKE_SIGNATURE_HEADER } = await import("@/lib/services/payments/fake");
const paymentsLib = await import("@/lib/services/payments");
const { createReservationHold, payReservation, cancelReservation, cancelPendingReservation, getMyReservation } =
  await import("@/server/reservations");
const { handlePaymentWebhook } = await import("@/server/payments");
const { isDomainError } = await import("@/server/errors");
const webhookRoute = await import("@/app/api/webhooks/payments/route");

const SECRET = "test-webhook-secret";
let w: World;
let provider: InstanceType<typeof FakePaymentProvider>;
let daysOut = 20;

beforeAll(async () => {
  await truncateAll(loadTestEnv().testUrl);
  w = await makeWorld();
});
beforeEach(() => {
  provider = new FakePaymentProvider({ webhookSecret: SECRET });
  (paymentsLib as unknown as { setPaymentProvider(p: unknown): void }).setPaymentProvider(provider);
});
afterAll(async () => {
  (paymentsLib as unknown as { resetPaymentProvider(): void }).resetPaymentProvider();
  await closeTestPool();
});

async function newHold(pickupInDays?: number) {
  const start = pickupInDays ?? (daysOut += 4);
  return createReservationHold(w.customer, {
    vehicleId: w.vehicleId, pickupBranchId: w.branchA, returnBranchId: w.branchA,
    pickupAt: dubai(start), returnAt: dubai(start + 3), idempotencyKey: newKey(),
  });
}
const pay = (reservationId: string, paymentMethod: string, idempotencyKey = newKey()) =>
  payReservation(w.customer, { reservationId, paymentMethod, idempotencyKey });

const rows = async <T extends object>(sql: string, p: unknown[]) => (await testPool().query<T>(sql, p)).rows;
const reservation = async (id: string) =>
  (await rows<{ status: string; total_fils: number; deposit_fils: number; refund_fils: number }>(
    "select status, total_fils, deposit_fils, refund_fils from reservations where id = $1", [id]))[0];
const paymentsOf = (id: string) =>
  rows<{ status: string; amount_fils: number; refunded_fils: number; attempt: number; provider_payment_id: string }>(
    "select status, amount_fils, refunded_fils, attempt, provider_payment_id from payments where reservation_id = $1 order by attempt", [id]);
const depositsOf = (id: string) =>
  rows<{ status: string; amount_fils: number; captured_fils: number }>(
    "select status, amount_fils, captured_fils from deposits where reservation_id = $1 order by attempt", [id]);

describe("paying for a reservation", () => {
  it("success: CONFIRMED, total charged once, deposit held for the category amount", async () => {
    const h = await newHold();
    const out = await pay(h.reservationId, "pm_fake_success");
    expect(out).toMatchObject({ reservationStatus: "CONFIRMED", paymentStatus: "SUCCEEDED", depositStatus: "HELD" });
    const r = await reservation(h.reservationId);
    expect(r.status).toBe("CONFIRMED");
    const p = await paymentsOf(h.reservationId);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ status: "SUCCEEDED", amount_fils: r.total_fils });
    expect(await depositsOf(h.reservationId)).toEqual([expect.objectContaining({ status: "HELD", amount_fils: w.depositFils })]);
    expect(r.total_fils).toBe(h.quote.totalFils);
  });

  it("declined: stays PENDING with canRetry, no deposit left held; retry with a new key confirms", async () => {
    const h = await newHold();
    const fail = await pay(h.reservationId, "pm_fake_declined");
    expect(fail).toMatchObject({ reservationStatus: "PENDING", paymentStatus: "FAILED", canRetry: true });
    expect(fail.failureReason).toBeTruthy();
    expect((await depositsOf(h.reservationId)).filter((d) => d.status === "HELD")).toHaveLength(0);

    const ok = await pay(h.reservationId, "pm_fake_success");
    expect(ok.reservationStatus).toBe("CONFIRMED");
    const p = await paymentsOf(h.reservationId);
    expect(p.map((x) => [x.attempt, x.status])).toEqual([[1, "FAILED"], [2, "SUCCEEDED"]]);
  });

  it("customer cancels at the provider: payment CANCELED, reservation still payable", async () => {
    const h = await newHold();
    const out = await pay(h.reservationId, "pm_fake_canceled");
    expect(out).toMatchObject({ reservationStatus: "PENDING", paymentStatus: "CANCELED", canRetry: true });
    const d = await getMyReservation(w.customer, h.reservationId);
    expect(d.canPay).toBe(true);
  });

  it("same idempotency key twice (also concurrently) charges once", async () => {
    const h = await newHold();
    const key = newKey();
    const [a, b] = await Promise.all([pay(h.reservationId, "pm_fake_success", key), pay(h.reservationId, "pm_fake_success", key)]);
    expect(a.reservationStatus).toBe("CONFIRMED");
    expect(b.reservationStatus).toBe("CONFIRMED");
    expect(await paymentsOf(h.reservationId)).toHaveLength(1);
    expect(provider.listEvents().filter((e) => e.type === "payment.succeeded")).toHaveLength(1);
  });

  it("paying an already confirmed reservation with a new key does not charge again", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    await pay(h.reservationId, "pm_fake_success").catch((e) => expect(isDomainError(e, "INVALID_STATE")).toBe(true));
    expect((await paymentsOf(h.reservationId)).filter((p) => p.status === "SUCCEEDED")).toHaveLength(1);
  });

  it("another customer cannot pay (or see) someone else's reservation", async () => {
    const h = await newHold();
    await expect(payReservation(w.other, { reservationId: h.reservationId, paymentMethod: "pm_fake_success", idempotencyKey: newKey() }))
      .rejects.toSatisfy((e) => isDomainError(e, "NOT_FOUND") || isDomainError(e, "FORBIDDEN"));
  });

  it("abandoning checkout after a failure releases the hold", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_declined");
    await cancelPendingReservation(w.customer, h.reservationId);
    expect(["CANCELLED", "EXPIRED"]).toContain((await reservation(h.reservationId)).status);
  });
});

describe("refunds and deposit release on cancellation", () => {
  it(">= 48h before pick-up: full refund, deposit released", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    await cancelReservation(w.customer, h.reservationId, { reason: "change of plans" });
    const r = await reservation(h.reservationId);
    expect(r.status).toMatch(/CANCELLED|REFUNDED/);
    expect(r.refund_fils).toBe(r.total_fils);
    expect((await paymentsOf(h.reservationId))[0]).toMatchObject({ status: "REFUNDED", refunded_fils: r.total_fils });
    expect((await depositsOf(h.reservationId))[0].status).toBe("RELEASED");
  });

  it("< 48h before pick-up: 50% refund (rounded to whole fils), deposit released", async () => {
    const h = await newHold(1); // pick-up tomorrow 10:00 Dubai, well under 48h
    await pay(h.reservationId, "pm_fake_success");
    await cancelReservation(w.customer, h.reservationId, {});
    const r = await reservation(h.reservationId);
    expect(Math.abs(r.refund_fils - r.total_fils / 2)).toBeLessThanOrEqual(0.5);
    expect(Number.isInteger(r.refund_fils)).toBe(true);
    expect((await paymentsOf(h.reservationId))[0]).toMatchObject({ status: "PARTIALLY_REFUNDED", refunded_fils: r.refund_fils });
    expect((await depositsOf(h.reservationId))[0].status).toBe("RELEASED");
  });

  it("another customer cannot cancel someone else's booking", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    await expect(cancelReservation(w.other, h.reservationId, {})).rejects.toSatisfy(
      (e) => isDomainError(e, "NOT_FOUND") || isDomainError(e, "FORBIDDEN"),
    );
    expect((await reservation(h.reservationId)).status).toBe("CONFIRMED");
  });
});

describe("webhooks", () => {
  const signed = (body: string) => signWebhook(body, SECRET, Math.floor(Date.now() / 1000));

  it("the same event delivered twice changes state once", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    const [p] = await paymentsOf(h.reservationId);
    // A refund made directly at the provider (dashboard) only reaches us through the webhook.
    await provider.refundPayment(p.provider_payment_id, 1000);
    const event = provider.listEvents().find((e) => e.type === "payment.refunded")!;
    const body = JSON.stringify(event);

    const first = await handlePaymentWebhook(body, signed(body));
    const second = await handlePaymentWebhook(body, signed(body));
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect((await paymentsOf(h.reservationId))[0]).toMatchObject({ status: "PARTIALLY_REFUNDED", refunded_fils: 1000 });
    const ev = await rows<{ n: number }>("select count(*)::int as n from payment_webhook_events where event_id = $1", [event.id]);
    expect(ev[0].n).toBe(1);
  });

  it("concurrent duplicate deliveries: still one state change", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    const [p] = await paymentsOf(h.reservationId);
    await provider.refundPayment(p.provider_payment_id, 500);
    const event = provider.listEvents().find((e) => e.type === "payment.refunded")!;
    const body = JSON.stringify(event);
    const results = await Promise.all(Array.from({ length: 5 }, () => handlePaymentWebhook(body, signed(body))));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect((await paymentsOf(h.reservationId))[0].refunded_fils).toBe(500);
  });

  it("route rejects a bad or missing signature and records nothing", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    const event = provider.listEvents().at(-1)!;
    const body = JSON.stringify({ ...event, id: `evt_forged_${newKey()}` });
    const post = (headers: Record<string, string>) =>
      webhookRoute.POST(new Request("http://localhost/api/webhooks/payments", { method: "POST", body, headers }) as never);

    const variants: Record<string, string>[] = [
      {},
      { [FAKE_SIGNATURE_HEADER]: "t=1,v1=deadbeef" },
      { [FAKE_SIGNATURE_HEADER]: signWebhook(body, "wrong-secret", Math.floor(Date.now() / 1000)) },
      { [FAKE_SIGNATURE_HEADER]: signWebhook(body, SECRET, Math.floor(Date.now() / 1000) - 3600) }, // stale
    ];
    for (const headers of variants) {
      const res = await post(headers);
      expect([400, 401]).toContain(res.status);
    }
    const ev = await rows<{ n: number }>("select count(*)::int as n from payment_webhook_events where event_id like 'evt_forged_%'", []);
    expect(ev[0].n).toBe(0);
  });

  it("route accepts a correctly signed event (200) and a duplicate (200, no change)", async () => {
    const h = await newHold();
    await pay(h.reservationId, "pm_fake_success");
    const event = provider.listEvents().find((e) => e.type === "payment.succeeded")!;
    const body = JSON.stringify(event);
    const post = () =>
      webhookRoute.POST(new Request("http://localhost/api/webhooks/payments", {
        method: "POST", body, headers: { "content-type": "application/json", [FAKE_SIGNATURE_HEADER]: signed(body) },
      }) as never);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect((await reservation(h.reservationId)).status).toBe("CONFIRMED");
    expect(await paymentsOf(h.reservationId)).toHaveLength(1);
  });
});
