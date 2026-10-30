import Stripe from "stripe";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import {
  buildApplyPaymentPayload,
  isDuplicateStripeEventError,
} from "@/lib/payments/webhookProcessor";

export type WebhookHandlerResult = { status: number; body: { received?: boolean; error?: string } };

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2025-02-24.acacia" });
}

export async function handleStripeWebhook(input: {
  rawBody: string;
  signatureHeader: string | null | undefined;
}): Promise<WebhookHandlerResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return { status: 500, body: { error: "Webhook secret not configured" } };
  if (!input.signatureHeader) return { status: 400, body: { error: "Missing Stripe signature" } };

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(input.rawBody, input.signatureHeader, secret);
  } catch (err) {
    console.warn("[stripe webhook] signature failed:", (err as Error).message);
    return { status: 400, body: { error: "Invalid signature" } };
  }

  if (event.type !== "checkout.session.completed") {
    return { status: 200, body: { received: true } };
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const amountTotalPence = session.amount_total ?? 0;
  const payload = buildApplyPaymentPayload({
    metadata: (session.metadata ?? {}) as Record<string, string | undefined>,
    stripeEventId: event.id,
    sessionId: session.id,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    amountTotalPence,
  });

  if (!payload) {
    console.warn("[stripe webhook] missing metadata on session", session.id);
    return { status: 200, body: { received: true } };
  }

  const admin = getServiceRoleSupabase();
  const { error } = await admin.rpc("apply_event_stripe_payment", {
    p_payment_transaction_id: payload.paymentTransactionId,
    p_stripe_event_id: payload.stripeEventId,
    p_stripe_session_id: payload.sessionId,
    p_stripe_payment_intent: payload.paymentIntentId,
    p_amount_pence: payload.amountTotalPence,
  });

  if (error) {
    if (isDuplicateStripeEventError(error.message)) {
      return { status: 200, body: { received: true } };
    }
    if (error.message.includes("payment_amount_mismatch")) {
      console.error("[stripe webhook] amount mismatch", payload);
      return { status: 422, body: { error: "Amount mismatch" } };
    }
    console.error("[stripe webhook] apply_event_stripe_payment:", error.message);
    return { status: 500, body: { error: "Failed to apply payment" } };
  }

  return { status: 200, body: { received: true } };
}
