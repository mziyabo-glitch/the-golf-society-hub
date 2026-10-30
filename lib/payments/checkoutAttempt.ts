export type OpenPaymentRow = {
  id: string;
  status: string;
  stripe_checkout_session_id: string | null;
  member_id?: string | null;
  guest_id?: string | null;
  idempotency_key?: string | null;
};

export type CheckoutAttempt =
  | { action: "already_paid"; transactionId: string }
  | { action: "reuse"; transactionId: string; sessionId: string | null }
  | { action: "create" };

export function selectParticipantCheckout(rows: OpenPaymentRow[]): CheckoutAttempt {
  const succeeded = rows.find((row) => row.status === "succeeded");
  if (succeeded) return { action: "already_paid", transactionId: succeeded.id };
  const pending = rows.find((row) => row.status === "pending");
  if (pending) {
    return {
      action: "reuse",
      transactionId: pending.id,
      sessionId: pending.stripe_checkout_session_id,
    };
  }
  return { action: "create" };
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
