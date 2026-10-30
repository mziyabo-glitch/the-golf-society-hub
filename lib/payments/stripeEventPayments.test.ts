import { readFileSync } from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import {
  resolveGuestCheckoutAmountPence,
  resolveMemberCheckoutAmountPence,
  shouldShowOnlinePayNow,
} from "@/lib/payments/eventPricing";
import { assertUuid, parseCheckoutRequestBody, validateSocietyPaymentsReady } from "@/lib/payments/checkoutValidation";
import {
  assertStripeTestMode,
  buildCheckoutReturnUrls,
  checkoutBelongsToPayer,
  selectParticipantCheckout,
  serverAppBaseUrl,
} from "@/lib/payments/checkoutAttempt";
import { paymentApplyFailureStatus, stripeEventDisposition, verifyPaidCheckout } from "@/lib/payments/webhookVerification";
import { handleStripeWebhook } from "@/lib/payments/stripeWebhookHandler";
import { handleConnectOnboarding } from "@/lib/payments/connectOnboarding";
import { handleRefundEventPayment } from "@/lib/payments/refundEventPayment";
import {
  canAuthoriseStripePaymentCorrectionForSociety,
  canManageEventPaymentsForSociety,
  canRefundEventPaymentsForSociety,
  canViewEventPaymentLedgerForSociety,
} from "@/lib/rbac";

const root = path.resolve(__dirname, "../..");
const txId = "00000000-0000-4000-8000-000000000010";
const eventId = "00000000-0000-4000-8000-000000000011";
const societyId = "00000000-0000-4000-8000-000000000012";
const beneficiaryId = "00000000-0000-4000-8000-000000000013";
const memberId = "00000000-0000-4000-8000-000000000014";

function paidSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "gbp",
    amount_total: 4500,
    payment_intent_id: "pi_test",
    metadata: {
      payment_transaction_id: txId,
      event_id: eventId,
      society_id: societyId,
      payer_type: "member",
      member_id: memberId,
      guest_id: "",
    },
    ...overrides,
  };
}

function pendingTx(overrides: Record<string, unknown> = {}) {
  return {
    id: txId,
    status: "pending",
    amount_pence: 4500,
    currency: "gbp",
    event_id: eventId,
    society_id: societyId,
    beneficiary_society_id: beneficiaryId,
    payer_type: "member",
    member_id: memberId,
    guest_id: null,
    stripe_checkout_session_id: "cs_test",
    stripe_payment_intent_id: null,
    stripe_connect_account_id: "acct_test",
    ...overrides,
  };
}

const intent = {
  id: "pi_test",
  amount: 4500,
  currency: "gbp",
  status: "succeeded",
  destinationAccountId: "acct_test",
  receiptUrl: "https://pay.stripe.com/receipts/test",
};

describe("stripe payment foundation", () => {
  it("migration files are plain SQL", () => {
    for (const file of [
      "supabase/migrations/20261030180000_stripe_event_payments_foundation.sql",
      "supabase/migrations/20261030240000_stripe_payment_integrity.sql",
    ]) {
      const sql = readFileSync(path.join(root, file), "utf8");
      expect(sql.includes("```")).toBe(false);
      expect(sql.includes("**")).toBe(false);
      expect(sql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
      expect(sql).toContain("ON DELETE SET NULL");
      expect(sql).not.toContain("gsh.payment_write");
    }
  });

  it("keeps online pay now off unless Connect is ready and the player is playing and unpaid", () => {
    const society = {
      online_payments_enabled: true,
      stripe_connect_account_id: "acct_test",
      stripe_connect_charges_enabled: true,
    };
    expect(shouldShowOnlinePayNow({ society, event: {}, amountPence: 4500, alreadyPaid: false, playing: true })).toBe(true);
    expect(shouldShowOnlinePayNow({ society: { ...society, online_payments_enabled: false }, event: {}, amountPence: 4500, alreadyPaid: false, playing: true })).toBe(false);
    expect(validateSocietyPaymentsReady({ ...society, online_payments_enabled: false })).toMatch(/not enabled/i);
  });

  it("uses joint participant pence and does not follow a client return URL", () => {
    expect(resolveMemberCheckoutAmountPence({ member_entry_fee_pence: 4000, joint_participant_entry_fee_pence: 3500 }, { isJointParticipantSociety: true })).toBe(3500);
    expect(resolveGuestCheckoutAmountPence({ guest_entry_fee_pence: 5500 })).toBe(5500);
    expect(serverAppBaseUrl("https://evil.example")).toBe("https://evil.example");
    expect(buildCheckoutReturnUrls(eventId, serverAppBaseUrl("https://app.example"))).toEqual({
      successUrl: `https://app.example/event/${eventId}?payment=success`,
      cancelUrl: `https://app.example/event/${eventId}?payment=canceled`,
    });
    expect(parseCheckoutRequestBody({ eventId })).toBeNull();
    expect(() => assertUuid("nope", "eventId")).toThrow(/Invalid eventId/);
  });

  it("reuses one open checkout and refuses another payer idempotency key", () => {
    expect(selectParticipantCheckout([{ id: "a", status: "succeeded", stripe_checkout_session_id: "cs" }]).action).toBe("already_paid");
    expect(selectParticipantCheckout([{ id: "b", status: "pending", stripe_checkout_session_id: "cs_open" }])).toMatchObject({
      action: "reuse",
      sessionId: "cs_open",
    });
    expect(checkoutBelongsToPayer({ member_id: "other" }, { payerType: "member", memberId, guestId: null })).toBe(false);
  });

  it("rejects a paid Checkout session whose Connect account or amount does not match", () => {
    const ok = verifyPaidCheckout({
      stripeEventId: "evt_1",
      session: paidSession(),
      paymentIntent: intent,
      transaction: pendingTx(),
      beneficiaryConnectAccountId: "acct_test",
    });
    expect(ok.ok).toBe(true);
    const mismatch = verifyPaidCheckout({
      stripeEventId: "evt_1",
      session: paidSession(),
      paymentIntent: { ...intent, destinationAccountId: "acct_other" },
      transaction: pendingTx(),
      beneficiaryConnectAccountId: "acct_test",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("payment_connect_account_mismatch");
    const unpaid = verifyPaidCheckout({
      stripeEventId: "evt_1",
      session: paidSession({ payment_status: "unpaid" }),
      paymentIntent: intent,
      transaction: pendingTx(),
      beneficiaryConnectAccountId: "acct_test",
    });
    expect(unpaid.ok).toBe(false);
  });

  it("asks Stripe to retry when the player row cannot be updated", () => {
    expect(paymentApplyFailureStatus("payment_target_missing").status).toBe(500);
    expect(paymentApplyFailureStatus('duplicate key value violates unique constraint "payment_transactions_payment_intent_uq"').status).toBe(409);
    expect(stripeEventDisposition("customer.created")).toBe("ignore");
    expect(stripeEventDisposition("checkout.session.completed")).toBe("apply");
  });

  it("separates attendance roles from the ledger and refunds", () => {
    const memberships = (role: string) => [{ societyId, role }];
    expect(canManageEventPaymentsForSociety(memberships("HANDICAPPER"), societyId)).toBe(true);
    expect(canViewEventPaymentLedgerForSociety(memberships("HANDICAPPER"), societyId)).toBe(false);
    expect(canViewEventPaymentLedgerForSociety(memberships("SECRETARY"), societyId)).toBe(false);
    expect(canViewEventPaymentLedgerForSociety(memberships("TREASURER"), societyId)).toBe(true);
    expect(canRefundEventPaymentsForSociety(memberships("CAPTAIN"), societyId)).toBe(false);
    expect(canRefundEventPaymentsForSociety(memberships("TREASURER"), societyId)).toBe(true);
    expect(canAuthoriseStripePaymentCorrectionForSociety(memberships("CAPTAIN"), societyId)).toBe(true);
    expect(canAuthoriseStripePaymentCorrectionForSociety(memberships("SECRETARY"), societyId)).toBe(false);
  });

  it("rejects a webhook with a bad signature before any payment is applied", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    let applied = false;
    const result = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=deadbeef" },
      {
        constructEvent: (raw, signature, secret) => new Stripe("sk_test_123").webhooks.constructEvent(raw, signature, secret),
        loadTransaction: async () => null,
        loadBeneficiaryConnectAccount: async () => null,
        retrievePaymentIntent: async () => null,
        applyPayment: async () => {
          applied = true;
        },
        syncConnectAccount: async () => undefined,
      },
    );
    expect(result.status).toBe(400);
    expect(applied).toBe(false);
  });

  it("refuses live keys for Connect onboarding and refunds", async () => {
    const connect = await handleConnectOnboarding(
      { authorizationHeader: "Bearer token", rawBody: { societyId } },
      {
        stripeKey: "sk_live_secret",
        getUserId: async () => "user",
        loadCallerRole: async () => "TREASURER",
        loadAccountId: async () => null,
        saveAccountId: async () => undefined,
        createExpressAccount: async () => "acct_new",
        createAccountLink: async () => "https://connect.stripe.com/setup/test",
      },
    );
    expect(connect.status).toBe(403);
    expect(assertStripeTestMode("sk_test_123")).toBeNull();

    const refund = await handleRefundEventPayment(
      { authorizationHeader: "Bearer token", idempotencyKey: "idem-1234", rawBody: { transactionId: txId } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "user",
        loadCallerRole: async () => "CAPTAIN",
        loadTransaction: async () => ({
          id: txId,
          society_id: societyId,
          status: "succeeded",
          payment_method: "stripe",
          stripe_payment_intent_id: "pi_test",
          amount_pence: 4500,
        }),
        createRefund: async () => "re_test",
        recordRefund: async () => undefined,
      },
    );
    expect(refund.status).toBe(403);
  });
});
