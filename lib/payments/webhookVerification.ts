import {
  STAGING_PLATFORM_CHARGE_METADATA_KEY,
  STAGING_PLATFORM_CHARGE_METADATA_VALUE,
} from "@/lib/payments/stagingPlatformCharge";

export type PaymentTransactionCheck = {
  id: string;
  status: string;
  amount_pence: number;
  currency: string;
  event_id: string | null;
  society_id: string | null;
  beneficiary_society_id: string | null;
  payer_type: string;
  member_id: string | null;
  guest_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_connect_account_id: string | null;
};

export type CheckoutSessionCheck = {
  id: string;
  mode: string | null;
  status: string | null;
  payment_status: string | null;
  currency: string | null;
  amount_total: number | null;
  payment_intent_id: string | null;
  metadata: Record<string, string | undefined>;
};

export type PaymentIntentCheck = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  destinationAccountId: string | null;
  applicationFeeAmount?: number | null;
  receiptUrl: string | null;
};

export type VerifiedStripePayment = {
  paymentTransactionId: string;
  stripeEventId: string;
  sessionId: string;
  paymentIntentId: string;
  amountPence: number;
  currency: "gbp";
  connectAccountId: string;
  eventId: string;
  beneficiarySocietyId: string;
  receiptUrl: string | null;
};

export type PaymentVerification =
  | { ok: true; payment: VerifiedStripePayment }
  | { ok: false; status: number; error: string; code: string };

export function stripeEventDisposition(eventType: string): "apply" | "connect" | "refund" | "ignore" {
  if (eventType === "checkout.session.completed" || eventType === "checkout.session.async_payment_succeeded") {
    return "apply";
  }
  if (eventType === "account.updated") return "connect";
  if (eventType === "refund.created" || eventType === "refund.updated") return "refund";
  return "ignore";
}

export type StripeRefundCheck = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  paymentIntentId: string | null;
};

export type RefundRecordStatus = "pending" | "succeeded" | "failed";

export function refundRecordStatus(stripeStatus: string): RefundRecordStatus | null {
  const status = stripeStatus.toLowerCase();
  if (status === "succeeded") return "succeeded";
  if (status === "pending" || status === "requires_action") return "pending";
  if (status === "failed" || status === "canceled" || status === "cancelled") return "failed";
  return null;
}

export function verifyStripeRefund(input: {
  refund: StripeRefundCheck;
  transaction: { stripe_payment_intent_id: string | null; amount_pence: number; currency: string };
}): { ok: true; recordStatus: RefundRecordStatus } | { ok: false; error: string } {
  const refund = input.refund;
  if (!refund.id || !refund.paymentIntentId) return { ok: false, error: "Stripe refund is incomplete" };
  if (refund.paymentIntentId !== input.transaction.stripe_payment_intent_id) {
    return { ok: false, error: "Stripe refund does not match this payment" };
  }
  if (refund.currency.toLowerCase() !== "gbp" || input.transaction.currency.toLowerCase() !== "gbp") {
    return { ok: false, error: "Stripe refund currency does not match" };
  }
  if (refund.amount !== input.transaction.amount_pence) {
    return { ok: false, error: "Stripe refund amount does not match" };
  }
  const recordStatus = refundRecordStatus(refund.status);
  if (!recordStatus) return { ok: false, error: "Stripe refund status cannot be recorded" };
  return { ok: true, recordStatus };
}

function meta(session: CheckoutSessionCheck, key: string): string {
  return session.metadata[key]?.trim() ?? "";
}

export function verifyPaidCheckout(input: {
  stripeEventId: string;
  session: CheckoutSessionCheck;
  paymentIntent: PaymentIntentCheck | null;
  transaction: PaymentTransactionCheck | null;
  beneficiaryConnectAccountId: string | null;
  /** True only when STAGING_PLATFORM_ONLY_PAYMENTS is safely on. */
  allowStagingPlatformCharge?: boolean;
}): PaymentVerification {
  const session = input.session;
  if (!input.transaction) {
    return { ok: false, status: 422, error: "Payment transaction was not found", code: "payment_transaction_not_found" };
  }
  const tx = input.transaction;
  if (session.mode !== "payment") {
    return { ok: false, status: 422, error: "Unexpected Checkout mode", code: "payment_mode_mismatch" };
  }
  if (session.status !== "complete" || session.payment_status !== "paid") {
    return { ok: false, status: 422, error: "Checkout payment is not paid", code: "payment_not_paid" };
  }
  if ((session.currency ?? "").toLowerCase() !== "gbp" || tx.currency !== "gbp") {
    return { ok: false, status: 422, error: "Currency mismatch", code: "payment_currency_mismatch" };
  }
  if (session.amount_total == null || session.amount_total !== tx.amount_pence || session.amount_total <= 0) {
    return { ok: false, status: 422, error: "Amount mismatch", code: "payment_amount_mismatch" };
  }
  if (meta(session, "payment_transaction_id") !== tx.id) {
    return { ok: false, status: 422, error: "Checkout session does not match the transaction", code: "payment_transaction_mismatch" };
  }
  if (!tx.event_id || meta(session, "event_id") !== tx.event_id) {
    return { ok: false, status: 422, error: "Event mismatch", code: "payment_event_mismatch" };
  }
  if (!tx.society_id || meta(session, "society_id") !== tx.society_id) {
    return { ok: false, status: 422, error: "Society mismatch", code: "payment_society_mismatch" };
  }
  if (meta(session, "payer_type") !== tx.payer_type) {
    return { ok: false, status: 422, error: "Payer mismatch", code: "payment_payer_mismatch" };
  }
  if (tx.payer_type === "member" && meta(session, "member_id") !== (tx.member_id ?? "")) {
    return { ok: false, status: 422, error: "Member mismatch", code: "payment_member_mismatch" };
  }
  if (tx.payer_type === "guest" && meta(session, "guest_id") !== (tx.guest_id ?? "")) {
    return { ok: false, status: 422, error: "Guest mismatch", code: "payment_guest_mismatch" };
  }
  if (!tx.beneficiary_society_id) {
    return { ok: false, status: 422, error: "Beneficiary society is missing", code: "payment_beneficiary_mismatch" };
  }
  if (tx.stripe_checkout_session_id && tx.stripe_checkout_session_id !== session.id) {
    return { ok: false, status: 422, error: "Checkout session mismatch", code: "payment_session_mismatch" };
  }
  if (!session.payment_intent_id) {
    return { ok: false, status: 422, error: "PaymentIntent is missing", code: "payment_intent_missing" };
  }
  if (tx.stripe_payment_intent_id && tx.stripe_payment_intent_id !== session.payment_intent_id) {
    return { ok: false, status: 422, error: "PaymentIntent mismatch", code: "payment_intent_mismatch" };
  }
  const intent = input.paymentIntent;
  if (!intent || intent.id !== session.payment_intent_id) {
    return { ok: false, status: 422, error: "PaymentIntent could not be confirmed", code: "payment_intent_unconfirmed" };
  }
  if (intent.status !== "succeeded") {
    return { ok: false, status: 422, error: "PaymentIntent is not succeeded", code: "payment_intent_not_succeeded" };
  }
  if (intent.amount !== tx.amount_pence || intent.currency.toLowerCase() !== "gbp") {
    return { ok: false, status: 422, error: "PaymentIntent amount or currency mismatch", code: "payment_intent_amount_mismatch" };
  }
  const stagingPlatformCharge = meta(session, STAGING_PLATFORM_CHARGE_METADATA_KEY) === STAGING_PLATFORM_CHARGE_METADATA_VALUE;
  let connectAccountId = input.beneficiaryConnectAccountId?.trim() || "";
  if (stagingPlatformCharge) {
    if (!input.allowStagingPlatformCharge) {
      return {
        ok: false,
        status: 422,
        error: "Staging platform charge is not permitted",
        code: "payment_staging_platform_refused",
      };
    }
    if (intent.destinationAccountId || (intent.applicationFeeAmount ?? 0) > 0 || (tx.stripe_connect_account_id ?? "").trim()) {
      return { ok: false, status: 422, error: "Connect account mismatch", code: "payment_connect_account_mismatch" };
    }
    connectAccountId = "";
  } else if (
    !connectAccountId ||
    intent.destinationAccountId !== connectAccountId ||
    tx.stripe_connect_account_id !== connectAccountId
  ) {
    return { ok: false, status: 422, error: "Connect account mismatch", code: "payment_connect_account_mismatch" };
  }

  return {
    ok: true,
    payment: {
      paymentTransactionId: tx.id,
      stripeEventId: input.stripeEventId,
      sessionId: session.id,
      paymentIntentId: intent.id,
      amountPence: tx.amount_pence,
      currency: "gbp",
      connectAccountId,
      eventId: tx.event_id,
      beneficiarySocietyId: tx.beneficiary_society_id,
      receiptUrl: intent.receiptUrl,
    },
  };
}

export function paymentApplyFailureStatus(message: string): { status: number; error: string } {
  const code = message.toLowerCase();
  if (code.includes("payment_target_missing") || code.includes("payment_transaction_not_found")) {
    return { status: 500, error: "Payment target could not be updated" };
  }
  if (code.includes("duplicate key") || code.includes("payment_intent_already_used") || code.includes("payment_already_applied")) {
    return { status: 409, error: "Payment was already recorded" };
  }
  if (
    code.includes("mismatch") ||
    code.includes("payment_not_payable") ||
    code.includes("payment_session_missing") ||
    code.includes("payment_intent_missing")
  ) {
    return { status: 422, error: "Payment verification failed" };
  }
  return { status: 500, error: "Failed to apply payment" };
}
