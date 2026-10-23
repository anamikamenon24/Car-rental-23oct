import type { NextRequest } from "next/server";
import { getPaymentProvider } from "@/lib/services/payments";
import { errorResponse } from "@/server/action";
import { handlePaymentWebhook } from "@/server/payments";

/**
 * Payment provider webhooks. The raw body is verified with the provider's signature header,
 * deduplicated by event id, and applied with idempotent state transitions.
 * 200 for processed and duplicate events; 401 for a bad signature.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const provider = getPaymentProvider();
  try {
    const result = await handlePaymentWebhook(raw, request.headers.get(provider.signatureHeader));
    return Response.json({ received: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
