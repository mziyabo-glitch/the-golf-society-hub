export type OpenPaymentRow = {
  id: string;
  status: string;
  stripe_checkout_session_id: string | null;
  member_id?: string | null;
  guest_id?: string | null;
  idempotency_key?: string | null;
  amount_pence?: number | null;
};

export type CheckoutAttempt =
  | { action: "already_paid"; transactionId: string }
  | { action: "reuse"; transactionId: string; sessionId: string | null }
  | { action: "create" };

export function selectParticipantCheckout(rows: OpenPaymentRow[]): CheckoutAttempt {
  const plan = planParticipantCheckout(rows, rows.find((row) => row.status === "pending")?.amount_pence ?? 0);
  if (plan.action === "already_paid" || plan.action === "blocked") {
    return { action: "already_paid", transactionId: plan.transactionId };
  }
  if (plan.action === "reuse" || plan.action === "supersede") {
    return { action: "reuse", transactionId: plan.transactionId, sessionId: plan.sessionId };
  }
  return { action: "create" };
}

export type CheckoutPlan =
  | { action: "already_paid"; transactionId: string }
  | { action: "blocked"; transactionId: string }
  | { action: "reuse"; transactionId: string; sessionId: string | null }
  | { action: "supersede"; transactionId: string; sessionId: string | null }
  | { action: "create" };

/** Pending rows whose amount no longer matches the current fee are superseded, not reused. */
export function planParticipantCheckout(rows: OpenPaymentRow[], currentAmountPence: number): CheckoutPlan {
  const succeeded = rows.find((row) => row.status === "succeeded");
  if (succeeded) return { action: "already_paid", transactionId: succeeded.id };
  const blocked = rows.find((row) => row.status === "refund_pending");
  if (blocked) return { action: "blocked", transactionId: blocked.id };
  const pending = rows.find((row) => row.status === "pending");
  if (!pending) return { action: "create" };
  if (pending.amount_pence !== currentAmountPence) {
    return {
      action: "supersede",
      transactionId: pending.id,
      sessionId: pending.stripe_checkout_session_id,
    };
  }
  return {
    action: "reuse",
    transactionId: pending.id,
    sessionId: pending.stripe_checkout_session_id,
  };
}

/**
 * Stripe stores idempotency results for 24 hours. A replacement session must not reuse
 * a stable `checkout_${id}_retry` key, or Stripe replays the expired session.
 * The key changes only when the session being replaced changes.
 */
export function stripeCheckoutIdempotencyKey(transactionId: string, replacedSessionId: string | null): string {
  if (!replacedSessionId) return `checkout_${transactionId}_initial`;
  return `checkout_${transactionId}_${replacedSessionId}`;
}

export function replacementLedgerIdempotencyKey(clientKey: string, amountPence: number, staleTransactionId: string): string {
  return `${clientKey}:fee:${amountPence}:${staleTransactionId}`.slice(0, 200);
}

export function checkoutBelongsToPayer(
  row: { member_id?: string | null; guest_id?: string | null; payer_type?: string | null },
  payer: { payerType: "member" | "guest"; memberId: string | null; guestId: string | null },
): boolean {
  if (payer.payerType === "member") return row.member_id === payer.memberId;
  return row.guest_id === payer.guestId;
}

export function buildCheckoutReturnUrls(eventId: string, appBaseUrl: string): { successUrl: string; cancelUrl: string } {
  const base = appBaseUrl.replace(/\/$/, "");
  return {
    successUrl: `${base}/event/${eventId}?payment=success`,
    cancelUrl: `${base}/event/${eventId}?payment=canceled`,
  };
}

export function serverAppBaseUrl(envValue: string | undefined): string {
  const configured = envValue?.trim() ?? "";
  if (/^https?:\/\//i.test(configured)) return configured.replace(/\/$/, "");
  return "http://localhost:8081";
}

export function assertStripeTestMode(secretKey: string | undefined): string | null {
  const key = secretKey?.trim() ?? "";
  if (!key.startsWith("sk_test_")) return "Stripe test mode is required.";
  return null;
}
