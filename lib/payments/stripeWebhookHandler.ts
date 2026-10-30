import Stripe from "stripe";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import {
  paymentApplyFailureStatus,
  stripeEventDisposition,
  verifyPaidCheckout,
  verifyStripeRefund,
  type PaymentIntentCheck,
  type PaymentTransactionCheck,
  type StripeRefundCheck,
} from "@/lib/payments/webhookVerification";

export type WebhookHandlerResult = { status: number; body: { received?: boolean; error?: string } };

type ApplyPayment = {
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

export type StripeWebhookDeps = {
  constructEvent: (rawBody: string, signature: string, secret: string) => Stripe.Event;
  loadTransaction: (id: string) => Promise<PaymentTransactionCheck | null>;
  loadBeneficiaryConnectAccount: (societyId: string) => Promise<string | null>;
  retrievePaymentIntent: (id: string) => Promise<PaymentIntentCheck | null>;
  applyPayment: (payment: ApplyPayment) => Promise<void>;
  syncConnectAccount: (account: {
    id: string;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
  }) => Promise<void>;
  loadTransactionByPaymentIntent?: (paymentIntentId: string) => Promise<PaymentTransactionCheck | null>;
  retrieveRefund?: (refundId: string) => Promise<StripeRefundCheck | null>;
  recordRefund?: (transactionId: string, refundId: string, status: "pending" | "succeeded" | "failed") => Promise<void>;
  consumeGuestInvitation?: (guestId: string) => Promise<void>;
};

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

function destinationAccountId(intent: Stripe.PaymentIntent): string | null {
  const destination = intent.transfer_data?.destination;
  if (!destination) return null;
  return typeof destination === "string" ? destination : destination.id;
}

function receiptUrl(intent: Stripe.PaymentIntent): string | null {
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") return null;
  return charge.receipt_url ?? null;
}

function mapRefund(refund: Stripe.Refund): StripeRefundCheck {
  const paymentIntent = refund.payment_intent;
  return {
    id: refund.id,
    status: refund.status ?? "",
    amount: refund.amount,
    currency: refund.currency,
    paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
  };
}

function defaultDeps(): StripeWebhookDeps {
  const stripe = getStripe();
  const admin = getServiceRoleSupabase();
  return {
    constructEvent: (rawBody, signature, secret) => stripe.webhooks.constructEvent(rawBody, signature, secret),
    async loadTransaction(id) {
      const { data, error } = await admin
        .from("payment_transactions")
        .select(
          "id, status, amount_pence, currency, event_id, society_id, beneficiary_society_id, payer_type, member_id, guest_id, stripe_checkout_session_id, stripe_payment_intent_id, stripe_connect_account_id",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PaymentTransactionCheck | null) ?? null;
    },
    async loadBeneficiaryConnectAccount(societyId) {
      const { data, error } = await admin
        .from("societies")
        .select("stripe_connect_account_id")
        .eq("id", societyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.stripe_connect_account_id as string | null) ?? null;
    },
    async retrievePaymentIntent(id) {
      const intent = await stripe.paymentIntents.retrieve(id, { expand: ["latest_charge"] });
      return {
        id: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        destinationAccountId: destinationAccountId(intent),
        receiptUrl: receiptUrl(intent),
      };
    },
    async applyPayment(payment) {
      const { error } = await admin.rpc("apply_event_stripe_payment", {
        p_payment_transaction_id: payment.paymentTransactionId,
        p_stripe_event_id: payment.stripeEventId,
        p_stripe_session_id: payment.sessionId,
        p_stripe_payment_intent: payment.paymentIntentId,
        p_amount_pence: payment.amountPence,
        p_currency: payment.currency,
        p_connect_account_id: payment.connectAccountId,
        p_event_id: payment.eventId,
        p_beneficiary_society_id: payment.beneficiarySocietyId,
        p_receipt_url: payment.receiptUrl,
      });
      if (error) throw new Error(error.message);
    },
    async syncConnectAccount(account) {
      const { error } = await admin
        .from("societies")
        .update({
          stripe_connect_charges_enabled: account.chargesEnabled,
          stripe_connect_details_submitted: account.detailsSubmitted,
        })
        .eq("stripe_connect_account_id", account.id);
      if (error) throw new Error(error.message);
    },
    async loadTransactionByPaymentIntent(paymentIntentId) {
      const { data, error } = await admin
        .from("payment_transactions")
        .select(
          "id, status, amount_pence, currency, event_id, society_id, beneficiary_society_id, payer_type, member_id, guest_id, stripe_checkout_session_id, stripe_payment_intent_id, stripe_connect_account_id",
        )
        .eq("stripe_payment_intent_id", paymentIntentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as PaymentTransactionCheck | null) ?? null;
    },
    async retrieveRefund(refundId) {
      return mapRefund(await stripe.refunds.retrieve(refundId));
    },
    async recordRefund(transactionId, refundId, status) {
      const { error } = await admin.rpc("record_event_stripe_refund", {
        p_payment_transaction_id: transactionId,
        p_stripe_refund_id: refundId,
        p_refund_status: status,
      });
      if (error) throw new Error(error.message);
    },
    async consumeGuestInvitation(guestId) {
      const { error } = await admin
        .from("event_guest_payment_invitations")
        .update({ consumed_at: new Date().toISOString() })
        .eq("guest_id", guestId)
        .is("consumed_at", null);
      if (error) throw new Error(error.message);
    },
  };
}

function sessionPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (!session.payment_intent) return null;
  return typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
}

export async function handleStripeWebhook(
  input: { rawBody: string; signatureHeader: string | null | undefined },
  deps?: StripeWebhookDeps,
): Promise<WebhookHandlerResult> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return { status: 500, body: { error: "Webhook secret not configured" } };
  if (!input.signatureHeader) return { status: 400, body: { error: "Missing Stripe signature" } };

  const runtime = deps ?? defaultDeps();
  let event: Stripe.Event;
  try {
    event = runtime.constructEvent(input.rawBody, input.signatureHeader, secret);
  } catch (err) {
    console.warn("[stripe webhook] signature failed:", (err as Error).message);
    return { status: 400, body: { error: "Invalid signature" } };
  }

  const disposition = stripeEventDisposition(event.type);
  if (disposition === "ignore") return { status: 200, body: { received: true } };

  if (disposition === "connect") {
    const account = event.data.object as Stripe.Account;
    if (!account.id) return { status: 422, body: { error: "Connect account id missing" } };
    try {
      await runtime.syncConnectAccount({
        id: account.id,
        chargesEnabled: account.charges_enabled === true,
        detailsSubmitted: account.details_submitted === true,
      });
    } catch (err) {
      console.error("[stripe webhook] connect sync:", (err as Error).message);
      return { status: 500, body: { error: "Failed to sync Connect account" } };
    }
    return { status: 200, body: { received: true } };
  }

  if (disposition === "refund") {
    const hinted = event.data.object as { id?: string };
    if (!hinted.id || !runtime.retrieveRefund || !runtime.loadTransactionByPaymentIntent || !runtime.recordRefund) {
      return { status: 500, body: { error: "Refund recording is not configured" } };
    }
    try {
      const refund = await runtime.retrieveRefund(hinted.id);
      if (!refund || refund.id !== hinted.id || !refund.paymentIntentId) {
        return { status: 422, body: { error: "Stripe refund could not be confirmed" } };
      }
      const transaction = await runtime.loadTransactionByPaymentIntent(refund.paymentIntentId);
      if (!transaction) return { status: 422, body: { error: "Payment transaction was not found" } };
      const verified = verifyStripeRefund({ refund, transaction });
      if (!verified.ok) return { status: 422, body: { error: verified.error } };
      await runtime.recordRefund(transaction.id, refund.id, verified.recordStatus);
      return { status: 200, body: { received: true } };
    } catch (err) {
      console.error("[stripe webhook] refund:", (err as Error).message);
      return { status: 500, body: { error: "Failed to record refund" } };
    }
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const transactionId = session.metadata?.payment_transaction_id?.trim() || "";
  if (!transactionId) return { status: 422, body: { error: "Checkout session is not an event payment" } };

  try {
    const transaction = await runtime.loadTransaction(transactionId);
    const beneficiaryId = transaction?.beneficiary_society_id ?? "";
    const beneficiaryConnectAccount = beneficiaryId
      ? await runtime.loadBeneficiaryConnectAccount(beneficiaryId)
      : null;
    const paymentIntentId = sessionPaymentIntentId(session);
    const paymentIntent = paymentIntentId ? await runtime.retrievePaymentIntent(paymentIntentId) : null;
    const verified = verifyPaidCheckout({
      stripeEventId: event.id,
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        payment_status: session.payment_status,
        currency: session.currency,
        amount_total: session.amount_total,
        payment_intent_id: paymentIntentId,
        metadata: (session.metadata ?? {}) as Record<string, string | undefined>,
      },
      paymentIntent,
      transaction,
      beneficiaryConnectAccountId: beneficiaryConnectAccount,
    });
    if (!verified.ok) return { status: verified.status, body: { error: verified.error } };
    await runtime.applyPayment(verified.payment);
    if (transaction?.payer_type === "guest" && transaction.guest_id && runtime.consumeGuestInvitation) {
      try {
        await runtime.consumeGuestInvitation(transaction.guest_id);
      } catch (err) {
        console.error("[stripe webhook] guest invitation:", (err as Error).message);
      }
    }
    return { status: 200, body: { received: true } };
  } catch (err) {
    const message = (err as Error).message || "Failed to apply payment";
    console.error("[stripe webhook]", message);
    const mapped = paymentApplyFailureStatus(message);
    return { status: mapped.status, body: { error: mapped.error } };
  }
}
