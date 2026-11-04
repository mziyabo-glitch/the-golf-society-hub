import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROCESSING_FEE_SCHEDULE,
  STRIPE_UK_CARD_FEE_BASIS_POINTS,
  STRIPE_UK_CARD_FEE_FIXED_PENCE,
  actualProcessingFeeFromBalance,
  grossUpChargePence,
  processingFeeLedgerView,
  processingFeeVariancePence,
  quoteCheckoutCharge,
  recordedProcessingFee,
} from "@/lib/payments/processingFee";
import { verifyStripeRefund } from "@/lib/payments/webhookVerification";
import { refundCreateParams } from "@/lib/payments/refundEventPayment";

describe("processing fee quote", () => {
  it("uses one UK card schedule of 1.5% plus 20 pence", () => {
    expect(DEFAULT_PROCESSING_FEE_SCHEDULE).toEqual({
      basisPoints: STRIPE_UK_CARD_FEE_BASIS_POINTS,
      fixedPence: STRIPE_UK_CARD_FEE_FIXED_PENCE,
    });
    expect(STRIPE_UK_CARD_FEE_BASIS_POINTS).toBe(150);
    expect(STRIPE_UK_CARD_FEE_FIXED_PENCE).toBe(20);
  });

  it("charges the event fee exactly when the society absorbs fees", () => {
    const quote = quoteCheckoutCharge(2500, null);
    expect(quote).toMatchObject({
      mode: "society_absorbs",
      intendedPence: 2500,
      estimatedProcessingFeePence: 0,
      grossPence: 2500,
    });
    expect(quoteCheckoutCharge(2500, "unset").grossPence).toBe(2500);
  });

  it("grosses up player-pays charges in integer pence so the society is not short", () => {
    expect(grossUpChargePence(2500)).toBe(2559);
    const quote = quoteCheckoutCharge(2500, "player_pays");
    expect(quote).toMatchObject({
      mode: "player_pays",
      intendedPence: 2500,
      estimatedProcessingFeePence: 59,
      grossPence: 2559,
      basisPoints: 150,
      fixedPence: 20,
    });
    const custom = quoteCheckoutCharge(1000, "player_pays", { basisPoints: 200, fixedPence: 10 });
    expect(custom.grossPence).toBe(grossUpChargePence(1000, { basisPoints: 200, fixedPence: 10 }));
    expect(custom.estimatedProcessingFeePence).toBe(custom.grossPence - 1000);
    expect(grossUpChargePence(100, { basisPoints: 0, fixedPence: 0 })).toBe(100);
  });

  it("records the balance-transaction fee and leaves the estimate unused", () => {
    const absorb = recordedProcessingFee({
      mode: "society_absorbs",
      estimatedProcessingFeePence: 0,
      actual: actualProcessingFeeFromBalance({ amount: 2500, fee: 99, net: 2401, currency: "gbp" }, 2500),
    });
    expect(absorb).toEqual({
      stripeProcessingFeePence: 99,
      stripeNetPence: 2401,
      variancePence: null,
      reconciled: true,
    });

    const player = recordedProcessingFee({
      mode: "player_pays",
      estimatedProcessingFeePence: 59,
      actual: actualProcessingFeeFromBalance({ amount: 2559, fee: 110, net: 2449, currency: "GBP" }, 2559),
    });
    expect(player.stripeProcessingFeePence).toBe(110);
    expect(player.stripeNetPence).toBe(2449);
    expect(player.variancePence).toBe(51);
    expect(processingFeeVariancePence("society_absorbs", 0, 99)).toBeNull();
    expect(processingFeeVariancePence("player_pays", 59, 40)).toBe(-19);

    const missing = recordedProcessingFee({
      mode: "player_pays",
      estimatedProcessingFeePence: 59,
      actual: null,
    });
    expect(missing).toEqual({
      stripeProcessingFeePence: null,
      stripeNetPence: null,
      variancePence: null,
      reconciled: false,
    });
    expect(actualProcessingFeeFromBalance({ amount: 2559, fee: 59, net: 2500, currency: "gbp" }, 2500)).toBeNull();
    expect(actualProcessingFeeFromBalance({ amount: 2500, fee: 99, net: 2400, currency: "gbp" }, 2500)).toBeNull();
    expect(actualProcessingFeeFromBalance(null, 2500)).toBeNull();
  });

  it("shows a refund of the amount charged and does not invent a fee", () => {
    const view = processingFeeLedgerView({
      processing_fee_mode: "player_pays",
      intended_fee_pence: 2500,
      amount_pence: 2559,
      estimated_processing_fee_pence: 59,
      stripe_processing_fee_pence: 110,
      stripe_net_pence: 2449,
      processing_fee_variance_pence: 51,
      status: "refunded",
    });
    expect(view.intendedLabel).toBe("£25.00");
    expect(view.grossLabel).toBe("£25.59");
    expect(view.feeLabel).toBe("£1.10");
    expect(view.netLabel).toBe("£24.49");
    expect(view.varianceLabel).toBe("£0.51");
    expect(view.reconciliationLabel).toBe("reconciled");
    expect(view.refundLabel).toBe("Refunded £25.59 charged");
    expect(view.modeLabel).toBe("Player pays processing fees");

    const waiting = processingFeeLedgerView({
      processing_fee_mode: "player_pays",
      intended_fee_pence: 2500,
      amount_pence: 2559,
      estimated_processing_fee_pence: 59,
      stripe_processing_fee_pence: null,
      stripe_net_pence: null,
      processing_fee_variance_pence: null,
      status: "succeeded",
    });
    expect(waiting.feeLabel).toBe("awaiting Stripe");
    expect(waiting.varianceLabel).toBeNull();
    expect(waiting.reconciliationLabel).toBe("not reconciled");
    expect(waiting.refundLabel).toBeNull();

    const absorbView = processingFeeLedgerView({
      amount_pence: 2500,
      stripe_processing_fee_pence: 99,
      stripe_net_pence: 2401,
      processing_fee_variance_pence: 99,
      status: "refunded",
    });
    expect(absorbView.modeLabel).toBe("Society absorbs processing fees");
    expect(absorbView.varianceLabel).toBeNull();
    expect(absorbView.refundLabel).toBe("Refunded £25.00 charged");

    expect(verifyStripeRefund({
      refund: { id: "re_short", status: "succeeded", amount: 2500, currency: "gbp", paymentIntentId: "pi_test" },
      transaction: { stripe_payment_intent_id: "pi_test", amount_pence: 2559, currency: "gbp" },
    }).ok).toBe(false);
    expect(verifyStripeRefund({
      refund: { id: "re_full", status: "succeeded", amount: 2559, currency: "gbp", paymentIntentId: "pi_test" },
      transaction: { stripe_payment_intent_id: "pi_test", amount_pence: 2559, currency: "gbp" },
    }).ok).toBe(true);
    expect(refundCreateParams("pi_test", "acct_ready")).toEqual({
      payment_intent: "pi_test",
      reverse_transfer: true,
    });
    expect(refundCreateParams("pi_test", "acct_ready")).not.toHaveProperty("amount");
  });
});
