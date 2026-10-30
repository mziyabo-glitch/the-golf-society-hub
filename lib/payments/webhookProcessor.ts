/**
 * Pure webhook event handling (unit-tested). Stripe SDK verification happens in route handler.
 */

export type StripeCheckoutCompletedPayload = {
  paymentTransactionId: string;
  stripeEventId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountTotalPence: number;
};

export function parseCheckoutSessionCompletedMetadata(meta: Record<string, string | undefined>): {
  paymentTransactionId: string | null;
} {
  const paymentTransactionId = meta.payment_transaction_id?.trim() || null;
  return { paymentTransactionId };
}

export function buildApplyPaymentPayload(input: {
  metadata: Record<string, string | undefined>;
  stripeEventId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountTotalPence: number;
}): StripeCheckoutCompletedPayload | null {
  const { paymentTransactionId } = parseCheckoutSessionCompletedMetadata(input.metadata);
  if (!paymentTransactionId) return null;
  if (input.amountTotalPence <= 0) return null;
  return {
    paymentTransactionId,
    stripeEventId: input.stripeEventId,
    sessionId: input.sessionId,
    paymentIntentId: input.paymentIntentId,
    amountTotalPence: input.amountTotalPence,
  };
}

/** Idempotent success: duplicate webhook deliveries should not error. */
export function isDuplicateStripeEventError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("duplicate key") && m.includes("stripe_event_id");
}
