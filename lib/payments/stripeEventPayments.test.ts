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
import { handleCreateEventCheckoutSession } from "@/lib/payments/createCheckoutSessionHandler";
import { handleCreateGuestCheckoutSession } from "@/lib/payments/guestCheckout";
import { planParticipantCheckout, stripeCheckoutIdempotencyKey } from "@/lib/payments/checkoutAttempt";
import { runEventCheckout, type CheckoutStore } from "@/lib/payments/runEventCheckout";
import { assessGuestCheckoutClaim, hashGuestPaymentToken } from "@/lib/payments/guestPaymentToken";
import { refundRecordStatus, verifyStripeRefund } from "@/lib/payments/webhookVerification";
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
          stripe_refund_id: null,
          amount_pence: 4500,
          currency: "gbp",
        }),
        createRefund: async () => ({ id: "re_test", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        retrieveRefund: async () => ({ id: "re_test", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        recordRefund: async () => undefined,
      },
    );
    expect(refund.status).toBe(403);
  });

  it("replaces a pending checkout when the fee changed and uses a fresh Stripe idempotency key", async () => {
    const staleId = "00000000-0000-4000-8000-000000000061";
    const created: { amountPence: number; idempotencyKey: string }[] = [];
    const stripeKeys: string[] = [];
    const canceled: string[] = [];
    let savedSession = "";
    const store: CheckoutStore = {
      cancelPending: async (id) => {
        canceled.push(id);
      },
      insertPending: async (row) => {
        created.push({ amountPence: row.amountPence, idempotencyKey: row.idempotencyKey });
        return "00000000-0000-4000-8000-000000000062";
      },
      saveSessionId: async (_id, sessionId) => {
        savedSession = sessionId;
      },
    };
    const result = await runEventCheckout({
      amountPence: 5000,
      idempotencyKey: "client-key-1234",
      payerType: "member",
      memberId,
      guestId: null,
      eventId,
      societyId,
      beneficiarySocietyId: beneficiaryId,
      societyName: "M4",
      beneficiarySocietyName: "M4",
      eventName: "Spring",
      eventDateSnapshot: "2026-05-01",
      payerDisplayName: "Player",
      connectAccountId: "acct_test",
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      rows: [{ id: staleId, status: "pending", amount_pence: 4000, stripe_checkout_session_id: "cs_old", member_id: memberId }],
      keyed: null,
      stripe: {
        retrieveSession: async () => ({ id: "cs_old", url: "https://pay.old", status: "open", payment_status: "unpaid", amount_total: 4000 }),
        expireSession: async () => undefined,
        createSession: async (_params, key) => {
          stripeKeys.push(key);
          return { id: "cs_new", url: "https://pay.new" };
        },
      },
      store,
    });
    expect(result.status).toBe(200);
    expect(canceled).toEqual([staleId]);
    expect(created).toEqual([{ amountPence: 5000, idempotencyKey: "client-key-1234:fee:5000:" + staleId }]);
    expect(stripeKeys).toEqual(["checkout_00000000-0000-4000-8000-000000000062_initial"]);
    expect(stripeKeys[0]).not.toContain("_retry");
    expect(savedSession).toBe("cs_new");
    expect(planParticipantCheckout([{ id: staleId, status: "pending", amount_pence: 4000, stripe_checkout_session_id: "cs_old" }], 5000).action).toBe("supersede");
    expect(stripeCheckoutIdempotencyKey(staleId, "cs_old")).toBe(`checkout_${staleId}_cs_old`);
    expect(stripeCheckoutIdempotencyKey(staleId, "cs_new")).not.toBe(stripeCheckoutIdempotencyKey(staleId, "cs_old"));
  });

  it("gives each expired-session replacement its own Stripe idempotency key", async () => {
    const keys: string[] = [];
    const store: CheckoutStore = {
      cancelPending: async () => undefined,
      insertPending: async () => txId,
      saveSessionId: async () => undefined,
    };
    const base = {
      amountPence: 4500,
      idempotencyKey: "client-key-1234",
      payerType: "member" as const,
      memberId,
      guestId: null,
      eventId,
      societyId,
      beneficiarySocietyId: beneficiaryId,
      societyName: "M4",
      beneficiarySocietyName: "M4",
      eventName: "Spring",
      eventDateSnapshot: null,
      payerDisplayName: "Player",
      connectAccountId: "acct_test",
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      keyed: null,
      store,
    };
    await runEventCheckout({
      ...base,
      rows: [{ id: txId, status: "pending", amount_pence: 4500, stripe_checkout_session_id: "cs_old", member_id: memberId }],
      stripe: {
        retrieveSession: async () => ({ id: "cs_old", url: null, status: "expired", payment_status: "unpaid", amount_total: 4500 }),
        expireSession: async () => undefined,
        createSession: async (_params, key) => {
          keys.push(key);
          return { id: "cs_second", url: "https://pay.second" };
        },
      },
    });
    await runEventCheckout({
      ...base,
      rows: [{ id: txId, status: "pending", amount_pence: 4500, stripe_checkout_session_id: "cs_second", member_id: memberId }],
      stripe: {
        retrieveSession: async () => ({ id: "cs_second", url: null, status: "expired", payment_status: "unpaid", amount_total: 4500 }),
        expireSession: async () => undefined,
        createSession: async (_params, key) => {
          keys.push(key);
          return { id: "cs_third", url: "https://pay.third" };
        },
      },
    });
    expect(keys).toEqual([`checkout_${txId}_cs_old`, `checkout_${txId}_cs_second`]);
    expect(keys.every((key) => !key.endsWith("_retry"))).toBe(true);
  });

  it("refuses a live key before creating a Checkout session", async () => {
    let created = false;
    const result = await handleCreateEventCheckoutSession(
      {
        authorizationHeader: "Bearer token",
        idempotencyKey: "idem-1234",
        rawBody: { eventId, societyId, payerType: "member" },
      },
      {
        stripeKey: "sk_live_secret",
        prepare: async () => {
          throw new Error("should not prepare");
        },
        stripe: {
          retrieveSession: async () => {
            throw new Error("should not retrieve");
          },
          expireSession: async () => undefined,
          createSession: async () => {
            created = true;
            return { id: "cs_live", url: "https://pay.live" };
          },
        },
        store: {
          cancelPending: async () => undefined,
          insertPending: async () => txId,
          saveSessionId: async () => undefined,
        },
      },
    );
    expect(result.status).toBe(403);
    expect(created).toBe(false);
    const guestRejected = await handleCreateEventCheckoutSession({
      authorizationHeader: "Bearer token",
      idempotencyKey: "idem-1234",
      rawBody: { eventId, societyId, payerType: "guest", guestId: "00000000-0000-4000-8000-000000000099" },
    });
    expect(guestRejected.status).toBe(400);
    const handlerSql = readFileSync(path.join(root, "lib/payments/createCheckoutSessionHandler.ts"), "utf8");
    const runnerSql = readFileSync(path.join(root, "lib/payments/runEventCheckout.ts"), "utf8");
    expect(handlerSql).not.toContain("_retry");
    expect(runnerSql).not.toContain("_retry");
  });

  it("rejects a guest checkout that is unauthorised, tampered, or already used", async () => {
    const token = "ab".repeat(32);
    const guestId = "00000000-0000-4000-8000-000000000071";
    let creates = 0;
    const invitation = {
      eventId,
      societyId,
      guestId,
      expiresAt: "2099-01-01T00:00:00.000Z",
      consumedAt: null,
    };
    const deps = {
      stripeKey: "sk_test_123",
      markInvitationUsed: async () => undefined,
      stripe: {
        retrieveSession: async () => ({ id: "cs_guest", url: "https://pay.guest", status: "open", payment_status: "unpaid", amount_total: 5500 }),
        expireSession: async () => undefined,
        createSession: async () => {
          creates += 1;
          return { id: "cs_guest", url: "https://pay.guest" };
        },
      },
      store: {
        cancelPending: async () => undefined,
        insertPending: async () => txId,
        saveSessionId: async () => undefined,
      },
      loadContext: async () => ({
        invitation,
        guest: { id: guestId, event_id: eventId, society_id: societyId, paid: false, name: "Guest" },
        event: { id: eventId, society_id: societyId, name: "Spring", date: "2026-05-01", guest_entry_fee_pence: 5500 },
        society: {
          id: societyId,
          name: "M4",
          online_payments_enabled: true,
          stripe_connect_account_id: "acct_test",
          stripe_connect_charges_enabled: true,
        },
        beneficiary: {
          id: beneficiaryId,
          name: "M4",
          stripe_connect_account_id: "acct_test",
          stripe_connect_charges_enabled: true,
        },
        rows: [] as { id: string; status: string; amount_pence: number; stripe_checkout_session_id: string | null; guest_id: string }[],
        keyed: null,
      }),
    };
    const unauthorised = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: "nope", eventId, societyId, guestId } },
      deps,
    );
    expect(unauthorised.status).toBe(401);
    const tampered = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 1 } },
      deps,
    );
    expect(tampered.status).toBe(400);
    const otherGuest = await handleCreateGuestCheckoutSession(
      {
        idempotencyKey: "idem-1234",
        rawBody: { paymentToken: token, eventId, societyId, guestId: "00000000-0000-4000-8000-000000000072", amountPence: 5500 },
      },
      deps,
    );
    expect(otherGuest.status).toBe(403);
    expect(creates).toBe(0);
    expect(assessGuestCheckoutClaim({
      invitation,
      claim: { eventId: "00000000-0000-4000-8000-000000000073", societyId, guestId, amountPence: 5500 },
      serverAmountPence: 5500,
    }).ok).toBe(false);
    expect(hashGuestPaymentToken(token)).toHaveLength(64);

    const readyContext = {
      invitation,
      guest: { id: guestId, event_id: eventId, society_id: societyId, paid: false, name: "Guest" },
      event: { id: eventId, society_id: societyId, name: "Spring", date: "2026-05-01", guest_entry_fee_pence: 5500 },
      society: {
        id: societyId,
        name: "M4",
        online_payments_enabled: true,
        stripe_connect_account_id: "acct_test",
        stripe_connect_charges_enabled: true,
      },
      beneficiary: {
        id: beneficiaryId,
        name: "M4",
        stripe_connect_account_id: "acct_test",
        stripe_connect_charges_enabled: true,
      },
      rows: [] as { id: string; status: string; amount_pence: number; stripe_checkout_session_id: string | null; guest_id: string }[],
      keyed: null,
    };
    deps.loadContext = async () => readyContext;
    const first = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 5500 } },
      deps,
    );
    expect(first.status).toBe(200);
    expect(creates).toBe(1);
    deps.loadContext = async () => ({
      ...readyContext,
      rows: [{ id: txId, status: "pending", amount_pence: 5500, stripe_checkout_session_id: "cs_guest", guest_id: guestId }],
    });
    const replay = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-5678", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 5500 } },
      deps,
    );
    expect(replay.status).toBe(200);
    expect(creates).toBe(1);
    deps.loadContext = async () => ({
      ...readyContext,
      rows: [{ id: txId, status: "succeeded", amount_pence: 5500, stripe_checkout_session_id: "cs_guest", guest_id: guestId }],
    });
    const duplicate = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-9999", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 5500 } },
      deps,
    );
    expect(duplicate.status).toBe(409);
    expect(creates).toBe(1);
  });

  it("records a verified refund once and leaves a failed refund unpaid-to-the-society", async () => {
    const recorded: { id: string; status: string }[] = [];
    const created: string[] = [];
    const baseTx = {
      id: txId,
      society_id: societyId,
      payment_method: "stripe",
      stripe_payment_intent_id: "pi_test",
      stripe_refund_id: null as string | null,
      amount_pence: 4500,
      currency: "gbp",
    };
    const succeeded = await handleRefundEventPayment(
      { authorizationHeader: "Bearer token", idempotencyKey: "idem-1234", rawBody: { transactionId: txId } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "user",
        loadCallerRole: async () => "TREASURER",
        loadTransaction: async () => ({ ...baseTx, status: "succeeded" }),
        createRefund: async () => {
          created.push("re_ok");
          return { id: "re_ok", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" };
        },
        retrieveRefund: async () => ({ id: "re_ok", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        recordRefund: async (id, _refundId, status) => {
          recorded.push({ id, status });
        },
      },
    );
    expect(succeeded.body.refundStatus).toBe("succeeded");

    const pending = await handleRefundEventPayment(
      { authorizationHeader: "Bearer token", idempotencyKey: "idem-1234", rawBody: { transactionId: txId } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "user",
        loadCallerRole: async () => "TREASURER",
        loadTransaction: async () => ({ ...baseTx, status: "succeeded" }),
        createRefund: async () => ({ id: "re_pend", status: "pending", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        retrieveRefund: async () => ({ id: "re_pend", status: "pending", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        recordRefund: async (id, _refundId, status) => {
          recorded.push({ id, status });
        },
      },
    );
    expect(pending.body.refundStatus).toBe("pending");

    let createCalls = 0;
    const refresh = await handleRefundEventPayment(
      { authorizationHeader: "Bearer token", idempotencyKey: "idem-2222", rawBody: { transactionId: txId } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "user",
        loadCallerRole: async () => "TREASURER",
        loadTransaction: async () => ({ ...baseTx, status: "refund_pending", stripe_refund_id: "re_pend" }),
        createRefund: async () => {
          createCalls += 1;
          return { id: "re_other", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" };
        },
        retrieveRefund: async () => ({ id: "re_pend", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        recordRefund: async (id, refundId, status) => {
          recorded.push({ id, status: `${refundId}:${status}` });
        },
      },
    );
    expect(createCalls).toBe(0);
    expect(refresh.body).toMatchObject({ refundId: "re_pend", refundStatus: "succeeded" });

    const failed = await handleRefundEventPayment(
      { authorizationHeader: "Bearer token", idempotencyKey: "idem-3333", rawBody: { transactionId: txId } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "user",
        loadCallerRole: async () => "TREASURER",
        loadTransaction: async () => ({ ...baseTx, status: "succeeded" }),
        createRefund: async () => ({ id: "re_bad", status: "failed", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        retrieveRefund: async () => ({ id: "re_bad", status: "failed", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        recordRefund: async (id, _refundId, status) => {
          recorded.push({ id, status });
        },
      },
    );
    expect(failed.body.refundStatus).toBe("failed");
    expect(recorded.map((row) => row.status)).toEqual(["succeeded", "pending", "re_pend:succeeded", "failed"]);
    expect(verifyStripeRefund({
      refund: { id: "re_bad", status: "succeeded", amount: 100, currency: "gbp", paymentIntentId: "pi_test" },
      transaction: { stripe_payment_intent_id: "pi_test", amount_pence: 4500, currency: "gbp" },
    }).ok).toBe(false);
    expect(refundRecordStatus("requires_action")).toBe("pending");

    const webhook = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => ({ id: "evt_refund", type: "refund.updated", data: { object: { id: "re_pend" } } }) as never,
        loadTransaction: async () => null,
        loadBeneficiaryConnectAccount: async () => null,
        retrievePaymentIntent: async () => null,
        applyPayment: async () => undefined,
        syncConnectAccount: async () => undefined,
        loadTransactionByPaymentIntent: async () => pendingTx({ status: "refund_pending", stripe_payment_intent_id: "pi_test" }),
        retrieveRefund: async () => ({ id: "re_pend", status: "succeeded", amount: 4500, currency: "gbp", paymentIntentId: "pi_test" }),
        recordRefund: async (_id, refundId, status) => {
          recorded.push({ id: refundId, status: `webhook:${status}` });
        },
      },
    );
    expect(webhook.status).toBe(200);
    expect(recorded.at(-1)).toEqual({ id: "re_pend", status: "webhook:succeeded" });
    expect(stripeEventDisposition("refund.updated")).toBe("refund");
  });
});
