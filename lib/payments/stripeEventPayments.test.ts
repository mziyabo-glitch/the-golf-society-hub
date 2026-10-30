import { describe, expect, it } from "vitest";
import {
  resolveMemberCheckoutAmountPence,
  resolveGuestCheckoutAmountPence,
  shouldShowOnlinePayNow,
} from "@/lib/payments/eventPricing";
import { validateSocietyPaymentsReady } from "@/lib/payments/checkoutValidation";
import { parseCheckoutRequestBody, assertUuid } from "@/lib/payments/checkoutValidation";
import {
  buildApplyPaymentPayload,
  isDuplicateStripeEventError,
  parseCheckoutSessionCompletedMetadata,
} from "@/lib/payments/webhookProcessor";

describe("stripe event payments — scenarios 1–13", () => {
  it("1 webhook retry: duplicate stripe_event_id is treated as benign", () => {
    expect(isDuplicateStripeEventError('duplicate key value violates unique constraint "payment_transactions_stripe_event_id_uq"')).toBe(
      true,
    );
  });

  it("2 RLS guard: payment metadata parser requires transaction id", () => {
    expect(parseCheckoutSessionCompletedMetadata({})).toEqual({ paymentTransactionId: null });
    expect(
      parseCheckoutSessionCompletedMetadata({ payment_transaction_id: "abc-123" }),
    ).toEqual({ paymentTransactionId: "abc-123" });
  });

  it("3 wrong society: checkout body requires societyId", () => {
    expect(parseCheckoutRequestBody({ eventId: "00000000-0000-4000-8000-000000000001" })).toBeNull();
  });

  it("4 feature flag off blocks society readiness", () => {
    expect(
      validateSocietyPaymentsReady({
        online_payments_enabled: false,
        stripe_connect_account_id: "acct_x",
        stripe_connect_charges_enabled: true,
      }),
    ).toMatch(/not enabled/i);
  });

  it("5 Connect not ready blocks checkout UI", () => {
    expect(
      shouldShowOnlinePayNow({
        society: {
          online_payments_enabled: true,
          stripe_connect_account_id: "acct_x",
          stripe_connect_charges_enabled: false,
        },
        event: {},
        amountPence: 4500,
        alreadyPaid: false,
        playing: true,
      }),
    ).toBe(false);
  });

  it("6 amount mismatch path: webhook payload rejects zero totals", () => {
    expect(
      buildApplyPaymentPayload({
        metadata: { payment_transaction_id: "00000000-0000-4000-8000-000000000099" },
        stripeEventId: "evt_1",
        sessionId: "cs_1",
        paymentIntentId: "pi_1",
        amountTotalPence: 0,
      }),
    ).toBeNull();
  });

  it("7 guest checkout amount from guest_entry_fee_pence", () => {
    expect(resolveGuestCheckoutAmountPence({ guest_entry_fee_pence: 5500 })).toBe(5500);
  });

  it("8 invalid uuid rejected", () => {
    expect(() => assertUuid("not-a-uuid", "eventId")).toThrow(/Invalid eventId/);
  });

  it("9 checkout.session.completed builds apply payload", () => {
    const payload = buildApplyPaymentPayload({
      metadata: {
        payment_transaction_id: "00000000-0000-4000-8000-000000000010",
        event_id: "00000000-0000-4000-8000-000000000011",
      },
      stripeEventId: "evt_completed",
      sessionId: "cs_test",
      paymentIntentId: "pi_test",
      amountTotalPence: 4500,
    });
    expect(payload?.amountTotalPence).toBe(4500);
    expect(payload?.paymentTransactionId).toBe("00000000-0000-4000-8000-000000000010");
  });

  it("10 manual path unchanged: member fee from member_entry_fee_pence", () => {
    expect(resolveMemberCheckoutAmountPence({ member_entry_fee_pence: 4500 })).toBe(4500);
  });

  it("11 joint participant fee prefers joint_participant_entry_fee_pence", () => {
    expect(
      resolveMemberCheckoutAmountPence(
        { member_entry_fee_pence: 4000, joint_participant_entry_fee_pence: 3500 },
        { isJointParticipantSociety: true },
      ),
    ).toBe(3500);
  });

  it("12 already paid hides Pay now", () => {
    expect(
      shouldShowOnlinePayNow({
        society: {
          online_payments_enabled: true,
          stripe_connect_account_id: "acct_x",
          stripe_connect_charges_enabled: true,
        },
        event: {},
        amountPence: 4500,
        alreadyPaid: true,
        playing: true,
      }),
    ).toBe(false);
  });

  it("13 playing required for Pay now", () => {
    expect(
      shouldShowOnlinePayNow({
        society: {
          online_payments_enabled: true,
          stripe_connect_account_id: "acct_x",
          stripe_connect_charges_enabled: true,
        },
        event: {},
        amountPence: 4500,
        alreadyPaid: false,
        playing: false,
      }),
    ).toBe(false);
  });
});
