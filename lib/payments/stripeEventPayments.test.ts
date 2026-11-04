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
import { omitStripeConnectOwnershipFields } from "@/lib/db_supabase/societyConnectFields";
import { handleRefundEventPayment, refundCreateParams } from "@/lib/payments/refundEventPayment";
import { handleCreateEventCheckoutSession } from "@/lib/payments/createCheckoutSessionHandler";
import { handleCreateGuestCheckoutSession } from "@/lib/payments/guestCheckout";
import { planParticipantCheckout, stripeCheckoutIdempotencyKey } from "@/lib/payments/checkoutAttempt";
import { CheckoutConflictError, classifyCheckoutRetrievalError, runEventCheckout, sessionParams, type CheckoutStore, type RunCheckoutInput } from "@/lib/payments/runEventCheckout";
import { quoteCheckoutCharge } from "@/lib/payments/processingFee";
import { assessMemberCheckoutEligibility } from "@/lib/payments/memberCheckoutEligibility";
import { paymentBeneficiaryError } from "@/lib/payments/paymentBeneficiary";
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
    beneficiary_society_id: societyId,
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
      "supabase/migrations/20261030190000_stripe_payment_integrity.sql",
    ]) {
      const sql = readFileSync(path.join(root, file), "utf8");
      expect(sql.includes("```")).toBe(false);
      expect(sql.includes("**")).toBe(false);
      expect(sql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
      expect(sql).toContain("ON DELETE SET NULL");
      expect(sql).not.toContain("gsh.payment_write");
    }
    const destinationSql = readFileSync(
      path.join(root, "supabase/migrations/20261030210000_payment_destination_and_checkout_eligibility.sql"),
      "utf8",
    );
    expect(destinationSql.includes("```")).toBe(false);
    expect(destinationSql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
    expect(destinationSql).toContain("payment_beneficiary_unauthorised");
    expect(destinationSql).toContain("guard_event_payment_beneficiary");
    expect(destinationSql).not.toContain("GRANT UPDATE (payment_beneficiary_society_id)");
    for (const file of [
      "supabase/migrations/20261030180000_stripe_event_payments_foundation.sql",
      "supabase/migrations/20261030190000_stripe_payment_integrity.sql",
      "supabase/migrations/20261030200000_guest_payment_invitations.sql",
      "supabase/migrations/20261030210000_payment_destination_and_checkout_eligibility.sql",
      "supabase/migrations/20261104021500_staging_platform_charge_apply.sql",
      "supabase/migrations/20261104140000_joint_payments_stay_with_payer_society.sql",
      "supabase/migrations/20261104160000_replace_society_own_connect_account.sql",
      "supabase/migrations/20261104180000_processing_fee_mode.sql",
      "supabase/migrations/20261104190000_processing_fee_mode_update.sql",
      "supabase/migrations/20261104200000_platform_fee.sql",
      "supabase/migrations/20261104210000_platform_fee_society_net.sql",
      "supabase/migrations/20261104220000_direct_charge.sql",
    ]) {
      const version = path.basename(file).slice(0, 14);
      const hour = Number(version.slice(8, 10));
      const minute = Number(version.slice(10, 12));
      const second = Number(version.slice(12, 14));
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
      expect(minute).toBeLessThanOrEqual(59);
      expect(second).toBeLessThanOrEqual(59);
    }
    const platformSql = readFileSync(
      path.join(root, "supabase/migrations/20261104021500_staging_platform_charge_apply.sql"),
      "utf8",
    );
    expect(platformSql).toContain("enabled boolean NOT NULL DEFAULT false");
    expect(platformSql).not.toContain("SET enabled = true");
    expect(platformSql).not.toContain("ALTER DATABASE");
    expect(platformSql).toContain("payment_connect_account_mismatch");
    const ownSocietySql = readFileSync(
      path.join(root, "supabase/migrations/20261104140000_joint_payments_stay_with_payer_society.sql"),
      "utf8",
    );
    expect(ownSocietySql).toContain("payment_beneficiary_own_society");
    expect(ownSocietySql).toContain("IS DISTINCT FROM p_payer_society_id");
    expect(ownSocietySql).not.toContain("GRANT UPDATE (payment_beneficiary_society_id)");
    expect(ownSocietySql).not.toContain("eaenzjwecrrbhibrvgsb.supabase.co");
    const replaceSql = readFileSync(
      path.join(root, "supabase/migrations/20261104160000_replace_society_own_connect_account.sql"),
      "utf8",
    );
    expect(replaceSql).toContain("stripe_connect_account_already_bound");
    expect(replaceSql).toContain("SET stripe_connect_account_id = v_account");
    expect(replaceSql).not.toContain("stripe_connect_account_id IS NULL");
    expect(replaceSql).toContain("payment_mutation_from_end_user");
    expect(replaceSql).not.toContain("GRANT EXECUTE ON FUNCTION public.assign_society_stripe_connect_account");
    const feeSql = readFileSync(
      path.join(root, "supabase/migrations/20261104180000_processing_fee_mode.sql"),
      "utf8",
    );
    expect(feeSql.includes("```")).toBe(false);
    expect(feeSql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
    expect(feeSql).toContain("DEFAULT 'society_absorbs'");
    expect(feeSql).toContain("record_event_stripe_processing_fee");
    expect(feeSql).toContain("WHEN v_tx.processing_fee_mode = 'player_pays' THEN p_fee_pence - v_tx.estimated_processing_fee_pence");
    expect(feeSql).toContain("Does not accept an estimate");
    expect(feeSql).toContain("REVOKE ALL ON FUNCTION public.record_event_stripe_processing_fee");
    expect(feeSql).not.toContain("GRANT EXECUTE ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer)\n  TO authenticated");
    expect(feeSql).toContain("TO service_role");
    const feeUpdateSql = readFileSync(
      path.join(root, "supabase/migrations/20261104190000_processing_fee_mode_update.sql"),
      "utf8",
    );
    expect(feeUpdateSql).toContain("GRANT UPDATE (processing_fee_mode)");
    expect(feeUpdateSql).toContain("DROP POLICY IF EXISTS societies_update_opening_balance_captain_treasurer");
    expect(feeUpdateSql).not.toContain("stripe_connect_account_id");
    expect("20261104190000" > "20261104180000").toBe(true);
    expect("20261104180000" > "20261104160000").toBe(true);
    const platformFeeSql = readFileSync(
      path.join(root, "supabase/migrations/20261104200000_platform_fee.sql"),
      "utf8",
    );
    expect(platformFeeSql.includes("```")).toBe(false);
    expect(platformFeeSql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
    expect(platformFeeSql).toContain("platform_fee_basis_points");
    expect(platformFeeSql).toContain("stripe_application_fee_pence");
    expect(platformFeeSql).toContain("p_fee_pence - (v_tx.estimated_processing_fee_pence - v_tx.platform_fee_pence)");
    expect(platformFeeSql).toContain("DROP FUNCTION IF EXISTS public.record_event_stripe_processing_fee(uuid, text, integer, integer)");
    expect(platformFeeSql).toContain("Does not accept an estimate");
    expect(platformFeeSql).toContain("refund_application_fee true");
    expect(platformFeeSql).toContain("REVOKE ALL ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer, integer)");
    expect(platformFeeSql).not.toContain("GRANT EXECUTE ON FUNCTION public.record_event_stripe_processing_fee(uuid, text, integer, integer, integer)\n  TO authenticated");
    expect(platformFeeSql).toContain("TO service_role");
    expect(platformFeeSql).not.toContain("eaenzjwecrrbhibrvgsb");
    expect("20261104200000" > "20261104190000").toBe(true);
    const societyNetSql = readFileSync(
      path.join(root, "supabase/migrations/20261104210000_platform_fee_society_net.sql"),
      "utf8",
    );
    expect(societyNetSql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
    expect(societyNetSql).toContain("p_application_fee_pence + p_net_pence IS DISTINCT FROM v_tx.amount_pence");
    expect(societyNetSql).toContain("Does not accept an estimate");
    expect(societyNetSql).not.toContain("TO authenticated");
    expect("20261104210000" > "20261104200000").toBe(true);
    const directChargeSql = readFileSync(
      path.join(root, "supabase/migrations/20261104220000_direct_charge.sql"),
      "utf8",
    );
    expect(directChargeSql).not.toMatch(/[\u2014\u2018\u2019\u201c\u201d\u00a0]/);
    expect(directChargeSql).toContain("direct charge");
    expect(directChargeSql).toContain("player_pays");
    expect(directChargeSql).not.toContain("eaenzjwecrrbhibrvgsb");
    expect("20261104220000" > "20261104210000").toBe(true);
    const handlerSql = readFileSync(path.join(root, "lib/payments/createCheckoutSessionHandler.ts"), "utf8");
    const guestSql = readFileSync(path.join(root, "lib/payments/guestCheckout.ts"), "utf8");
    expect(handlerSql).toContain('.eq("id", body.societyId)');
    expect(handlerSql).toContain("quoteCheckoutCharge(amountPence, society.processing_fee_mode");
    expect(guestSql).toContain("quoteCheckoutCharge(claim.amountPence, context.society.processing_fee_mode");
    expect(handlerSql).not.toContain("hostSociety.processing_fee_mode");
  });

  it("keeps online pay now off unless Connect is ready and the player is playing and unpaid", () => {
    const society = {
      online_payments_enabled: true,
      stripe_connect_account_id: "acct_test",
      stripe_connect_charges_enabled: true,
    };
    expect(shouldShowOnlinePayNow({ society, event: {}, amountPence: 4500, alreadyPaid: false, playing: true })).toBe(true);
    expect(shouldShowOnlinePayNow({ society: { ...society, online_payments_enabled: false }, event: {}, amountPence: 4500, alreadyPaid: false, playing: true })).toBe(false);
    expect(shouldShowOnlinePayNow({
      society: { online_payments_enabled: true, stripe_connect_charges_enabled: false, stripe_connect_account_id: "acct_test" },
      event: {},
      amountPence: 2500,
      alreadyPaid: false,
      playing: true,
    })).toBe(false);
    expect(shouldShowOnlinePayNow({
      society: { online_payments_enabled: true, stripe_connect_charges_enabled: false },
      event: {},
      amountPence: 2500,
      alreadyPaid: false,
      playing: true,
      stagingPlatformCharge: true,
    })).toBe(true);
    expect(shouldShowOnlinePayNow({
      society: { online_payments_enabled: false },
      event: {},
      amountPence: 2500,
      alreadyPaid: false,
      playing: true,
      stagingPlatformCharge: true,
    })).toBe(false);
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
        confirmAccountExclusive: async () => undefined,
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

  it("binds a new Connect account only to the society that is onboarding", async () => {
    const saved: { societyId: string; accountId: string }[] = [];
    const links: string[] = [];
    const m4 = "22000000-0000-4000-8000-000000000001";
    const result = await handleConnectOnboarding(
      { authorizationHeader: "Bearer token", rawBody: { societyId: m4 } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "treasurer",
        loadCallerRole: async () => "TREASURER",
        loadAccountId: async () => null,
        saveAccountId: async (id, accountId) => {
          saved.push({ societyId: id, accountId });
        },
        confirmAccountExclusive: async (id, accountId) => {
          if (id !== m4 || accountId !== "acct_new_m4") throw new Error("stripe_connect_account_already_bound");
        },
        createExpressAccount: async () => "acct_new_m4",
        createAccountLink: async (accountId) => {
          links.push(accountId);
          return "https://connect.stripe.com/setup/s/test";
        },
      },
    );
    expect(result.status).toBe(200);
    expect(saved).toEqual([{ societyId: m4, accountId: "acct_new_m4" }]);
    expect(links).toEqual(["acct_new_m4"]);
    expect(omitStripeConnectOwnershipFields({
      name: "M4",
      stripe_connect_account_id: "acct_zgs",
      stripe_connect_charges_enabled: true,
      stripeConnectDetailsSubmitted: true,
    })).toEqual({ name: "M4" });
  });

  it("does not mint an account link when the Connect account belongs to another society", async () => {
    const links: string[] = [];
    const zgs = "22000000-0000-4000-8000-000000000002";
    const result = await handleConnectOnboarding(
      { authorizationHeader: "Bearer token", rawBody: { societyId: zgs } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "captain",
        loadCallerRole: async () => "CAPTAIN",
        loadAccountId: async () => "acct_m4",
        saveAccountId: async () => {
          throw new Error("save should not run when an account id is already stored");
        },
        confirmAccountExclusive: async () => {
          throw new Error("stripe_connect_account_already_bound");
        },
        createExpressAccount: async () => "acct_should_not_create",
        createAccountLink: async () => {
          links.push("link");
          return "https://connect.stripe.com/setup/s/test";
        },
      },
    );
    expect(result.status).toBe(409);
    expect(links).toEqual([]);

    const saved: string[] = [];
    const created = await handleConnectOnboarding(
      { authorizationHeader: "Bearer token", rawBody: { societyId: zgs } },
      {
        stripeKey: "sk_test_123",
        getUserId: async () => "captain",
        loadCallerRole: async () => "CAPTAIN",
        loadAccountId: async () => null,
        saveAccountId: async () => {
          saved.push("saved");
          throw new Error('duplicate key value violates unique constraint "societies_stripe_connect_account_id_uq"');
        },
        confirmAccountExclusive: async () => undefined,
        createExpressAccount: async () => "acct_m4",
        createAccountLink: async () => {
          links.push("link");
          return "https://connect.stripe.com/setup/s/test";
        },
      },
    );
    expect(created.status).toBe(409);
    expect(saved).toEqual(["saved"]);
    expect(links).toEqual([]);
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
      beneficiarySocietyId: societyId,
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
      beneficiarySocietyId: societyId,
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

  it("lets confirmed and legacy players pay, and blocks unregistered, withdrawn, closed, and full events", () => {
    const now = new Date("2026-06-01T12:00:00.000Z");
    const closed = "2026-05-01T00:00:00.000Z";
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: { status: "in", removed_from_event_at: null },
      playerIds: [],
      rsvpDeadlineAt: closed,
      now,
      attendingCount: 20,
      maxAttendees: 20,
    })).toEqual({ ok: true, via: "confirmed" });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: null,
      playerIds: [memberId],
      rsvpDeadlineAt: closed,
      now,
      attendingCount: 20,
      maxAttendees: 20,
    })).toEqual({ ok: true, via: "legacy_roster" });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: null,
      playerIds: [],
      eventEntryStatus: "confirmed",
      now,
    })).toEqual({ ok: true, via: "legacy_roster" });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: null,
      playerIds: [],
      now,
    }).ok).toBe(false);
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: { status: "out" },
      playerIds: [memberId],
      now,
    })).toMatchObject({ ok: false, error: "RSVP as playing before paying" });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: { status: "in", removed_from_event_at: "2026-05-02T00:00:00.000Z" },
      now,
    })).toMatchObject({ ok: false });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: null,
      playerIds: [],
      rsvpDeadlineAt: closed,
      now,
      maxAttendees: 30,
      attendingCount: 1,
    })).toMatchObject({ error: "RSVP is closed" });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: null,
      playerIds: [],
      now,
      maxAttendees: 4,
      attendingCount: 4,
    })).toMatchObject({ error: "This event is full" });
    expect(assessMemberCheckoutEligibility({
      memberId,
      registration: null,
      eventEntryStatus: "withdrawn",
      playerIds: [],
      now,
    })).toMatchObject({ error: "RSVP as playing before paying" });
    expect(paymentBeneficiaryError({
      payerSocietyId: societyId,
      beneficiarySocietyId: societyId,
    })).toBeNull();
    expect(paymentBeneficiaryError({
      payerSocietyId: societyId,
      beneficiarySocietyId: beneficiaryId,
    })).toMatch(/own society/i);
  });

  it("refuses a Checkout or webhook that would pay another society", async () => {
    let created = 0;
    const refused = await runEventCheckout({
      amountPence: 2500,
      idempotencyKey: "client-key-1234",
      payerType: "member",
      memberId,
      guestId: null,
      eventId,
      societyId,
      beneficiarySocietyId: beneficiaryId,
      societyName: "M4",
      beneficiarySocietyName: "ZGS",
      eventName: "M4 v ZGS",
      eventDateSnapshot: null,
      payerDisplayName: "Player",
      connectAccountId: "acct_zgs",
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      rows: [],
      keyed: null,
      stripe: {
        retrieveSession: async () => {
          throw new Error("should not retrieve");
        },
        expireSession: async () => undefined,
        createSession: async () => {
          created += 1;
          return { id: "cs_other", url: "https://pay.other" };
        },
      },
      store: {
        cancelPending: async () => undefined,
        insertPending: async () => txId,
        saveSessionId: async () => undefined,
      },
    });
    expect(refused.status).toBe(403);
    expect(created).toBe(0);
    const mismatch = verifyPaidCheckout({
      stripeEventId: "evt_other",
      session: paidSession(),
      paymentIntent: intent,
      transaction: pendingTx({ beneficiary_society_id: beneficiaryId }),
      beneficiaryConnectAccountId: "acct_test",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe("payment_beneficiary_mismatch");
  });

  it("does not replace or cancel a live Checkout when Stripe cannot be reached", async () => {
    expect(classifyCheckoutRetrievalError(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }))).toBe("unknown");
    expect(classifyCheckoutRetrievalError(Object.assign(new Error("unavailable"), { statusCode: 503, type: "StripeAPIError" }))).toBe("unknown");
    expect(classifyCheckoutRetrievalError(Object.assign(new Error("missing"), { statusCode: 404, code: "resource_missing" }))).toBe("missing");

    const pending = {
      id: txId,
      status: "pending",
      amount_pence: 4500,
      stripe_checkout_session_id: "cs_live",
      member_id: memberId,
    };
    const calls = { create: 0, expire: 0, cancel: 0, save: 0 };
    const store: CheckoutStore = {
      cancelPending: async () => {
        calls.cancel += 1;
      },
      insertPending: async () => {
        throw new Error("should not insert");
      },
      saveSessionId: async () => {
        calls.save += 1;
      },
    };
    const base = {
      amountPence: 4500,
      idempotencyKey: "client-key-1234",
      payerType: "member" as const,
      memberId,
      guestId: null,
      eventId,
      societyId,
      beneficiarySocietyId: societyId,
      societyName: "M4",
      beneficiarySocietyName: "M4",
      eventName: "Spring",
      eventDateSnapshot: null,
      payerDisplayName: "Player",
      connectAccountId: "acct_test",
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      rows: [pending],
      keyed: null,
      store,
    };
    const unknownStripe = {
      retrieveSession: async () => {
        throw Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" });
      },
      expireSession: async () => {
        calls.expire += 1;
      },
      createSession: async () => {
        calls.create += 1;
        return { id: "cs_new", url: "https://pay.new" };
      },
    };
    const [first, second] = await Promise.all([
      runEventCheckout({ ...base, stripe: unknownStripe }),
      runEventCheckout({ ...base, stripe: unknownStripe }),
    ]);
    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(calls).toEqual({ create: 0, expire: 0, cancel: 0, save: 0 });

    const apiError = await runEventCheckout({
      ...base,
      stripe: {
        retrieveSession: async () => {
          throw Object.assign(new Error("Internal Server Error"), { statusCode: 500, type: "StripeAPIError" });
        },
        expireSession: async () => {
          calls.expire += 1;
        },
        createSession: async () => {
          calls.create += 1;
          return { id: "cs_new", url: "https://pay.new" };
        },
      },
    });
    expect(apiError.status).toBe(503);
    expect(calls.create).toBe(0);
    expect(calls.expire).toBe(0);

    const replaced: string[] = [];
    const missing = await runEventCheckout({
      ...base,
      stripe: {
        retrieveSession: async () => {
          throw Object.assign(new Error("No such checkout.session"), { statusCode: 404, code: "resource_missing" });
        },
        expireSession: async () => {
          calls.expire += 1;
        },
        createSession: async (_params, key) => {
          replaced.push(key);
          return { id: "cs_after_missing", url: "https://pay.after" };
        },
      },
    });
    expect(missing.status).toBe(200);
    expect(calls.expire).toBe(0);
    expect(calls.cancel).toBe(0);
    expect(replaced).toEqual([`checkout_${txId}_cs_live`]);

    const canceled = await runEventCheckout({
      ...base,
      rows: [{ ...pending, stripe_checkout_session_id: "cs_canceled" }],
      stripe: {
        retrieveSession: async () => ({ id: "cs_canceled", url: null, status: "canceled", payment_status: "unpaid", amount_total: 4500 }),
        expireSession: async () => {
          calls.expire += 1;
        },
        createSession: async () => ({ id: "cs_after_cancel", url: "https://pay.cancel" }),
      },
    });
    expect(canceled.status).toBe(200);
    expect(calls.expire).toBe(0);
    expect("sessionId" in canceled.body ? canceled.body.sessionId : "").toBe("cs_after_cancel");

    let inserts = 0;
    let creates = 0;
    const concurrentStore: CheckoutStore = {
      cancelPending: async () => undefined,
      insertPending: async () => {
        if (inserts > 0) throw new CheckoutConflictError("A payment is already in progress");
        inserts += 1;
        return txId;
      },
      saveSessionId: async () => undefined,
    };
    const concurrent = await Promise.allSettled([
      runEventCheckout({
        ...base,
        rows: [],
        store: concurrentStore,
        stripe: {
          retrieveSession: async () => {
            throw new Error("should not retrieve");
          },
          expireSession: async () => undefined,
          createSession: async () => {
            creates += 1;
            return { id: "cs_once", url: "https://pay.once" };
          },
        },
      }),
      runEventCheckout({
        ...base,
        rows: [],
        store: concurrentStore,
        stripe: {
          retrieveSession: async () => {
            throw new Error("should not retrieve");
          },
          expireSession: async () => undefined,
          createSession: async () => {
            creates += 1;
            return { id: "cs_twice", url: "https://pay.twice" };
          },
        },
      }),
    ]);
    expect(inserts).toBe(1);
    expect(creates).toBe(1);
    expect(concurrent.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(concurrent.filter((row) => row.status === "rejected")).toHaveLength(1);

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const appliedSessions: string[] = [];
    const paidEvent = {
      id: "evt_late",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_live",
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          currency: "gbp",
          amount_total: 4500,
          payment_intent: "pi_test",
          metadata: {
            payment_transaction_id: txId,
            event_id: eventId,
            society_id: societyId,
            beneficiary_society_id: societyId,
            payer_type: "member",
            member_id: memberId,
            guest_id: "",
          },
        },
      },
    };
    const webhookDeps = {
      constructEvent: () => paidEvent as never,
      loadTransaction: async () => pendingTx({ stripe_checkout_session_id: "cs_live" }),
      loadBeneficiaryConnectAccount: async () => "acct_test",
      retrievePaymentIntent: async () => intent,
      applyPayment: async (payment: { sessionId: string }) => {
        appliedSessions.push(payment.sessionId);
      },
      syncConnectAccount: async () => undefined,
    };
    const late = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, webhookDeps);
    const duplicate = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, {
      ...webhookDeps,
      constructEvent: () => ({ ...paidEvent, id: "evt_late_2" }) as never,
      applyPayment: async () => {
        throw new Error("payment_already_applied");
      },
    });
    const unpaid = await handleStripeWebhook({ rawBody: "{}", signatureHeader: "t=1,v1=ok" }, {
      ...webhookDeps,
      constructEvent: () => ({
        ...paidEvent,
        id: "evt_unpaid",
        data: { object: { ...paidEvent.data.object, payment_status: "unpaid", status: "complete" } },
      }) as never,
      applyPayment: async () => {
        appliedSessions.push("unpaid");
      },
    });
    expect(late.status).toBe(200);
    expect(appliedSessions).toEqual(["cs_live"]);
    expect(duplicate.status).toBe(409);
    expect(unpaid.status).toBe(422);
    expect(stripeEventDisposition("checkout.session.expired")).toBe("ignore");
  });

  it("snapshots both processing-fee modes and records only a real balance transaction", async () => {
    const checkoutBase = {
      idempotencyKey: "client-key-1234",
      payerType: "member" as const,
      memberId,
      guestId: null,
      eventId,
      societyId,
      beneficiarySocietyId: societyId,
      societyName: "M4",
      beneficiarySocietyName: "M4",
      eventName: "Spring",
      eventDateSnapshot: null,
      payerDisplayName: "Player",
      connectAccountId: "acct_payer",
      successUrl: "https://app.example/success",
      cancelUrl: "https://app.example/cancel",
      rows: [],
      keyed: null,
      stripe: {
        retrieveSession: async () => {
          throw new Error("unused");
        },
        expireSession: async () => undefined,
        createSession: async () => ({ id: "cs", url: null }),
      },
      store: {
        cancelPending: async () => undefined,
        insertPending: async () => txId,
        saveSessionId: async () => undefined,
      },
    } satisfies Omit<RunCheckoutInput, "amountPence">;

    const absorb = sessionParams({ ...checkoutBase, amountPence: 2500 }, txId);
    expect(absorb.line_items).toHaveLength(1);
    expect(absorb.line_items?.[0]?.price_data?.unit_amount).toBe(2500);
    expect(absorb.payment_intent_data?.transfer_data).toBeUndefined();
    expect(absorb.payment_intent_data?.on_behalf_of).toBeUndefined();
    expect(absorb.payment_intent_data?.application_fee_amount).toBe(50);
    expect(JSON.stringify(absorb)).not.toContain("transfer_data");

    const playerQuote = quoteCheckoutCharge(2500, "player_pays");
    const player = sessionParams({
      ...checkoutBase,
      amountPence: playerQuote.grossPence,
      processingFeeMode: "player_pays",
      intendedFeePence: playerQuote.intendedPence,
      estimatedProcessingFeePence: 110,
    }, txId);
    const playerLines = player.line_items ?? [];
    expect(playerLines).toHaveLength(1);
    expect(playerLines[0]?.price_data?.unit_amount).toBe(2500);
    expect(player.payment_intent_data?.application_fee_amount).toBe(50);
    expect(player.payment_intent_data?.transfer_data).toBeUndefined();
    expect(quoteCheckoutCharge(4500, "player_pays").applicationFeeAmount).toBe(90);

    const inserted: { amountPence: number; processingFeeMode?: string; intendedFeePence?: number; estimatedProcessingFeePence?: number; platformFeeBasisPoints?: number; platformFeePence?: number; societyId: string; beneficiarySocietyId: string; connectAccountId: string | null }[] = [];
    const created: { lineCount: number; total: number; destination?: string; applicationFee?: number; onBehalfOf?: string; stripeAccount?: string | null }[] = [];
    const hostId = beneficiaryId;
    const token = "cd".repeat(32);
    const guestId = "00000000-0000-4000-8000-000000000081";
    const guest = await handleCreateGuestCheckoutSession(
      { idempotencyKey: "idem-1234", rawBody: { paymentToken: token, eventId, societyId, guestId, amountPence: 2500 } },
      {
        stripeKey: "sk_test_123",
        markInvitationUsed: async () => undefined,
        stripe: {
          retrieveSession: async () => ({ id: "cs_guest_fee", url: "https://pay.guest", status: "open", payment_status: "unpaid", amount_total: 2500 }),
          expireSession: async () => undefined,
          createSession: async (params, _key, stripeAccount) => {
            const lines = params.line_items ?? [];
            created.push({
              lineCount: lines.length,
              total: lines.reduce((sum, line) => sum + (line.price_data?.unit_amount ?? 0), 0),
              destination: params.payment_intent_data?.transfer_data?.destination,
              applicationFee: params.payment_intent_data?.application_fee_amount,
              onBehalfOf: params.payment_intent_data?.on_behalf_of,
              stripeAccount: stripeAccount ?? null,
            });
            return { id: "cs_guest_fee", url: "https://pay.guest" };
          },
        },
        store: {
          cancelPending: async () => undefined,
          insertPending: async (row) => {
            inserted.push({
              amountPence: row.amountPence,
              processingFeeMode: row.processingFeeMode,
              intendedFeePence: row.intendedFeePence,
              estimatedProcessingFeePence: row.estimatedProcessingFeePence,
              platformFeeBasisPoints: row.platformFeeBasisPoints,
              platformFeePence: row.platformFeePence,
              societyId: row.societyId,
              beneficiarySocietyId: row.beneficiarySocietyId,
              connectAccountId: row.stripeConnectAccountId,
            });
            return txId;
          },
          saveSessionId: async () => undefined,
        },
        loadContext: async () => ({
          invitation: { eventId, societyId, guestId, expiresAt: "2099-01-01T00:00:00.000Z", consumedAt: null },
          guest: { id: guestId, event_id: eventId, society_id: societyId, paid: false, name: "Guest" },
          event: { id: eventId, society_id: hostId, name: "Joint", date: "2026-05-01", guest_entry_fee_pence: 2500 },
          society: {
            id: societyId,
            name: "Payer society",
            online_payments_enabled: true,
            stripe_connect_account_id: "acct_payer",
            stripe_connect_charges_enabled: true,
            processing_fee_mode: "player_pays",
          },
          rows: [],
          keyed: null,
        }),
      },
    );
    expect(guest.status).toBe(200);
    expect(inserted[0]).toEqual({
      amountPence: 2500,
      processingFeeMode: "society_absorbs",
      intendedFeePence: 2500,
      estimatedProcessingFeePence: 0,
      platformFeeBasisPoints: 200,
      platformFeePence: 50,
      societyId,
      beneficiarySocietyId: societyId,
      connectAccountId: "acct_payer",
    });
    expect(inserted[0]?.beneficiarySocietyId).not.toBe(hostId);
    expect(created[0]).toEqual({
      lineCount: 1,
      total: 2500,
      destination: undefined,
      applicationFee: 50,
      onBehalfOf: undefined,
      stripeAccount: "acct_payer",
    });

    const jointFee = resolveMemberCheckoutAmountPence(
      { member_entry_fee_pence: 9900, joint_participant_entry_fee_pence: 2500 },
      { isJointParticipantSociety: true },
    );
    expect(quoteCheckoutCharge(jointFee, "society_absorbs").grossPence).toBe(2500);
    expect(quoteCheckoutCharge(jointFee, "player_pays").grossPence).toBe(2500);

    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    const paidEvent = {
      id: "evt_fee",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_fee",
          mode: "payment",
          status: "complete",
          payment_status: "paid",
          currency: "gbp",
          amount_total: 2559,
          payment_intent: "pi_fee",
          metadata: {
            payment_transaction_id: txId,
            event_id: eventId,
            society_id: societyId,
            beneficiary_society_id: societyId,
            payer_type: "guest",
            member_id: "",
            guest_id: guestId,
          },
        },
      },
    };
    const recorded: { feePence: number; netPence: number; applicationFeePence?: number }[] = [];
    const withoutBalance = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => paidEvent as never,
        loadTransaction: async () => pendingTx({
          amount_pence: 2559,
          stripe_checkout_session_id: "cs_fee",
          stripe_connect_account_id: "acct_payer",
          payer_type: "guest",
          guest_id: guestId,
          member_id: null,
        }),
        loadBeneficiaryConnectAccount: async () => "acct_payer",
        retrievePaymentIntent: async () => ({ ...intent, id: "pi_fee", amount: 2559, destinationAccountId: "acct_payer" }),
        applyPayment: async () => undefined,
        recordProcessingFee: async (fee) => {
          recorded.push({ feePence: fee.feePence, netPence: fee.netPence, applicationFeePence: fee.applicationFeePence });
        },
        syncConnectAccount: async () => undefined,
      },
    );
    expect(withoutBalance.status).toBe(200);
    expect(recorded).toEqual([]);

    const withBalance = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => paidEvent as never,
        loadTransaction: async () => pendingTx({
          amount_pence: 2559,
          stripe_checkout_session_id: "cs_fee",
          stripe_connect_account_id: "acct_payer",
          payer_type: "guest",
          guest_id: guestId,
          member_id: null,
        }),
        loadBeneficiaryConnectAccount: async () => "acct_payer",
        retrievePaymentIntent: async () => ({
          ...intent,
          id: "pi_fee",
          amount: 2559,
          destinationAccountId: "acct_payer",
          balanceTransaction: { amount: 2559, fee: 110, net: 2449, currency: "gbp" },
        }),
        applyPayment: async () => undefined,
        recordProcessingFee: async (fee) => {
          recorded.push({ feePence: fee.feePence, netPence: fee.netPence, applicationFeePence: fee.applicationFeePence });
        },
        syncConnectAccount: async () => undefined,
      },
    );
    expect(withBalance.status).toBe(200);
    expect(recorded).toEqual([{ feePence: 110, netPence: 2449, applicationFeePence: 0 }]);

    const lateFee = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => ({
          id: "evt_charge",
          type: "charge.updated",
          data: { object: { id: "ch_fee", payment_intent: "pi_fee", balance_transaction: "txn_fee" } },
        }) as never,
        loadTransaction: async () => null,
        loadBeneficiaryConnectAccount: async () => null,
        retrievePaymentIntent: async () => null,
        applyPayment: async () => undefined,
        syncConnectAccount: async () => undefined,
        loadTransactionByPaymentIntent: async () => pendingTx({
          status: "succeeded",
          amount_pence: 2500,
          stripe_payment_intent_id: "pi_fee",
        }),
        retrieveBalanceTransaction: async () => ({ amount: 2500, fee: 99, net: 2401, currency: "gbp" }),
        recordProcessingFee: async (fee) => {
          recorded.push({ feePence: fee.feePence, netPence: fee.netPence, applicationFeePence: fee.applicationFeePence });
        },
      },
    );
    expect(lateFee.status).toBe(200);
    expect(recorded.at(-1)).toEqual({ feePence: 99, netPence: 2401, applicationFeePence: 0 });
    expect(stripeEventDisposition("charge.updated")).toBe("balance");

    const estimateOnly = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => ({
          id: "evt_charge_bare",
          type: "charge.updated",
          data: { object: { id: "ch_bare", payment_intent: "pi_fee", balance_transaction: "txn_missing" } },
        }) as never,
        loadTransaction: async () => null,
        loadBeneficiaryConnectAccount: async () => null,
        retrievePaymentIntent: async () => null,
        applyPayment: async () => undefined,
        syncConnectAccount: async () => undefined,
        loadTransactionByPaymentIntent: async () => pendingTx({ status: "succeeded", amount_pence: 2559, stripe_payment_intent_id: "pi_fee" }),
        retrieveBalanceTransaction: async () => null,
        recordProcessingFee: async () => {
          recorded.push({ feePence: 59, netPence: 2500 });
        },
      },
    );
    expect(estimateOnly.status).toBe(200);
    expect(recorded).toHaveLength(2);

    const directAccounts: Array<string | null> = [];
    const fromStripe = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => ({ ...paidEvent, id: "evt_fee_actual", account: "acct_direct", data: { object: { ...paidEvent.data.object, amount_total: 2500 } } }) as never,
        loadTransaction: async () => pendingTx({
          amount_pence: 2500,
          stripe_checkout_session_id: "cs_fee",
          stripe_connect_account_id: "acct_payer",
          platform_fee_pence: 50,
          payer_type: "guest",
          guest_id: guestId,
          member_id: null,
        }),
        loadBeneficiaryConnectAccount: async () => "acct_payer",
        retrievePaymentIntent: async (_id, stripeAccount) => {
          directAccounts.push(stripeAccount ?? null);
          return {
          ...intent,
          id: "pi_fee",
          amount: 2500,
          destinationAccountId: "acct_payer",
          applicationFeeAmount: 50,
          balanceTransaction: {
            amount: 2500,
            fee: 149,
            net: 2351,
            currency: "gbp",
            feeDetails: [
              { type: "stripe_fee", amount: 99 },
              { type: "application_fee", amount: 50 },
            ],
          },
          };
        },
        applyPayment: async () => undefined,
        recordProcessingFee: async (fee) => {
          recorded.push({ feePence: fee.feePence, netPence: fee.netPence, applicationFeePence: fee.applicationFeePence });
        },
        syncConnectAccount: async () => undefined,
      },
    );
    expect(directAccounts).toEqual(["acct_direct"]);
    expect(fromStripe.status).toBe(200);
    expect(recorded.at(-1)).toEqual({ feePence: 99, netPence: 2351, applicationFeePence: 50 });

    const guessed = await handleStripeWebhook(
      { rawBody: "{}", signatureHeader: "t=1,v1=ok" },
      {
        constructEvent: () => ({
          id: "evt_fee_guess",
          type: "charge.updated",
          data: { object: { id: "ch_guess", payment_intent: "pi_fee", application_fee_amount: 50, balance_transaction: "txn_guess" } },
        }) as never,
        loadTransaction: async () => null,
        loadBeneficiaryConnectAccount: async () => null,
        retrievePaymentIntent: async () => null,
        applyPayment: async () => undefined,
        syncConnectAccount: async () => undefined,
        loadTransactionByPaymentIntent: async () => pendingTx({
          status: "succeeded",
          amount_pence: 2500,
          stripe_payment_intent_id: "pi_fee",
          platform_fee_pence: 50,
        }),
        retrieveBalanceTransaction: async () => ({ amount: 2500, fee: 149, net: 2351, currency: "gbp" }),
        recordProcessingFee: async () => {
          recorded.push({ feePence: 50, netPence: 2450, applicationFeePence: 50 });
        },
      },
    );
    expect(guessed.status).toBe(200);
    expect(recorded).toHaveLength(3);
    expect(refundCreateParams("pi_fee", "acct_payer")).toEqual({
      payment_intent: "pi_fee",
      refund_application_fee: true,
    });
    expect(refundCreateParams("pi_fee", "acct_payer")).not.toHaveProperty("reverse_transfer");

    const platformSession = sessionParams({
      ...checkoutBase,
      amountPence: 2500,
      platformCharge: true,
      connectAccountId: null,
    }, txId);
    expect(platformSession.payment_intent_data).toBeUndefined();
    expect(JSON.stringify(platformSession)).not.toContain("application_fee_amount");
  });
});
