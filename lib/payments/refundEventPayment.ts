import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import { assertStripeTestMode } from "@/lib/payments/checkoutAttempt";
import { assertUuid } from "@/lib/payments/checkoutValidation";
import { verifyStripeRefund, type RefundRecordStatus, type StripeRefundCheck } from "@/lib/payments/webhookVerification";

export type RefundResult = {
  status: number;
  body: { refundId?: string; refundStatus?: RefundRecordStatus; error?: string };
};

type RefundTransaction = {
  id: string;
  society_id: string | null;
  status: string;
  payment_method: string;
  stripe_payment_intent_id: string | null;
  stripe_connect_account_id?: string | null;
  stripe_refund_id: string | null;
  amount_pence: number;
  currency: string;
};

/**
 * Full refund of the charged PaymentIntent. A direct charge on a connected
 * account is refunded with the Stripe-Account header and
 * `refund_application_fee: true`, so Stripe returns Golf Society Hub's
 * platform fee. `reverse_transfer` is not set: a direct charge has no
 * transfer. A staging platform-only charge has no application fee and does
 * not set that flag. The ledger does not invent a fee on the refund row.
 */
export function refundCreateParams(
  paymentIntentId: string,
  connectAccountId: string | null | undefined,
): Stripe.RefundCreateParams {
  const params: Stripe.RefundCreateParams = { payment_intent: paymentIntentId };
  if (connectAccountId?.trim()) {
    params.refund_application_fee = true;
  }
  return params;
}

type RefundDeps = {
  stripeKey: string;
  getUserId: (accessToken: string) => Promise<string | null>;
  loadCallerRole: (userId: string, societyId: string) => Promise<string | null>;
  loadTransaction: (id: string) => Promise<RefundTransaction | null>;
  createRefund: (paymentIntentId: string, idempotencyKey: string, connectAccountId?: string | null) => Promise<StripeRefundCheck>;
  retrieveRefund: (refundId: string, stripeAccount?: string | null) => Promise<StripeRefundCheck | null>;
  recordRefund: (transactionId: string, refundId: string, status: RefundRecordStatus) => Promise<void>;
  recordApplicationFeeRefund?: (transactionId: string, refundedPence: number) => Promise<void>;
};

function applicationFeeRefundedPence(refund: Stripe.Refund): number | null {
  const charge = refund.charge;
  if (!charge || typeof charge === "string") return null;
  const fee = charge.application_fee;
  if (!fee || typeof fee === "string") return null;
  return typeof fee.amount_refunded === "number" ? fee.amount_refunded : null;
}

async function mapRefundWithPlatformFee(stripe: Stripe, refund: Stripe.Refund): Promise<StripeRefundCheck> {
  const mapped = mapRefund(refund);
  if (mapped.applicationFeeRefundedPence != null) return mapped;
  const charge = refund.charge;
  if (!charge || typeof charge === "string") return mapped;
  const fee = charge.application_fee;
  const feeId = !fee ? "" : typeof fee === "string" ? fee : fee.id;
  if (!feeId) return mapped;
  try {
    const applicationFee = await stripe.applicationFees.retrieve(feeId);
    return { ...mapped, applicationFeeRefundedPence: applicationFee.amount_refunded };
  } catch (err) {
    console.error("[stripe refund] application fee:", (err as Error).message);
    return mapped;
  }
}

function mapRefund(refund: Stripe.Refund): StripeRefundCheck {
  const paymentIntent = refund.payment_intent;
  return {
    id: refund.id,
    status: refund.status ?? "",
    amount: refund.amount,
    currency: refund.currency,
    paymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null,
    applicationFeeRefundedPence: applicationFeeRefundedPence(refund),
  };
}

function userClient(accessToken: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase URL/anon key missing");
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function defaultDeps(): RefundDeps {
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  const admin = getServiceRoleSupabase();
  return {
    stripeKey,
    async getUserId(accessToken) {
      const client = userClient(accessToken);
      const { data, error } = await client.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return data.user.id;
    },
    async loadCallerRole(userId, societyId) {
      const { data } = await admin.from("members").select("role").eq("user_id", userId).eq("society_id", societyId).maybeSingle();
      return (data?.role as string | null) ?? null;
    },
    async loadTransaction(id) {
      const { data } = await admin
        .from("payment_transactions")
        .select("id, society_id, status, payment_method, stripe_payment_intent_id, stripe_connect_account_id, stripe_refund_id, amount_pence, currency")
        .eq("id", id)
        .maybeSingle();
      return (data as RefundTransaction | null) ?? null;
    },
    async createRefund(paymentIntentId, idempotencyKey, connectAccountId) {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
      const account = connectAccountId?.trim() || "";
      const refund = await stripe.refunds.create(
        {
          ...refundCreateParams(paymentIntentId, connectAccountId),
          expand: ["charge.application_fee"],
        },
        { idempotencyKey, ...(account ? { stripeAccount: account } : {}) },
      );
      return mapRefundWithPlatformFee(stripe, refund);
    },
    async retrieveRefund(refundId, stripeAccount) {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
      const account = stripeAccount?.trim() || "";
      return mapRefundWithPlatformFee(
        stripe,
        await stripe.refunds.retrieve(
          refundId,
          { expand: ["charge.application_fee"] },
          account ? { stripeAccount: account } : undefined,
        ),
      );
    },
    async recordRefund(transactionId, refundId, status) {
      const { error } = await admin.rpc("record_event_stripe_refund", {
        p_payment_transaction_id: transactionId,
        p_stripe_refund_id: refundId,
        p_refund_status: status,
      });
      if (error) throw new Error(error.message);
    },
    async recordApplicationFeeRefund(transactionId, refundedPence) {
      const { error } = await admin.rpc("record_event_stripe_application_fee_refund", {
        p_payment_transaction_id: transactionId,
        p_refunded_pence: refundedPence,
      });
      if (error) throw new Error(error.message);
    },
  };
}

async function recordVerifiedRefund(
  runtime: RefundDeps,
  transaction: RefundTransaction,
  refund: StripeRefundCheck,
): Promise<RefundResult> {
  const verified = verifyStripeRefund({ refund, transaction });
  if (!verified.ok) return { status: 422, body: { error: verified.error } };
  await runtime.recordRefund(transaction.id, refund.id, verified.recordStatus);
  if (refund.applicationFeeRefundedPence != null && runtime.recordApplicationFeeRefund) {
    try {
      await runtime.recordApplicationFeeRefund(transaction.id, refund.applicationFeeRefundedPence);
    } catch (err) {
      console.error("[stripe refund] application fee:", (err as Error).message);
    }
  }
  return { status: 200, body: { refundId: refund.id, refundStatus: verified.recordStatus } };
}

export async function handleRefundEventPayment(
  input: {
    authorizationHeader: string | null | undefined;
    idempotencyKey: string | null | undefined;
    rawBody: unknown;
  },
  deps?: RefundDeps,
): Promise<RefundResult> {
  const runtime = deps ?? defaultDeps();
  const testModeError = assertStripeTestMode(runtime.stripeKey);
  if (testModeError) return { status: 403, body: { error: testModeError } };

  const token = input.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, body: { error: "Missing authorization" } };
  const idempotencyKey = input.idempotencyKey?.trim() || "";
  if (idempotencyKey.length < 8) return { status: 400, body: { error: "Missing Idempotency-Key header" } };

  const body = input.rawBody as { transactionId?: string } | null;
  const transactionId = body?.transactionId?.trim() || "";
  try {
    assertUuid(transactionId, "transactionId");
  } catch (err) {
    return { status: 400, body: { error: (err as Error).message } };
  }

  const userId = await runtime.getUserId(token);
  if (!userId) return { status: 401, body: { error: "Invalid session" } };
  const transaction = await runtime.loadTransaction(transactionId);
  if (!transaction?.society_id) return { status: 404, body: { error: "Payment not found" } };
  if (transaction.payment_method !== "stripe" || !transaction.stripe_payment_intent_id) {
    return { status: 409, body: { error: "Only a succeeded Stripe payment can be refunded" } };
  }

  const role = (await runtime.loadCallerRole(userId, transaction.society_id))?.toUpperCase() ?? "";
  if (role !== "TREASURER") return { status: 403, body: { error: "Only a Treasurer can refund event payments" } };

  try {
    if (transaction.status === "refunded" && transaction.stripe_refund_id) {
      return { status: 200, body: { refundId: transaction.stripe_refund_id, refundStatus: "succeeded" } };
    }
    if (transaction.status === "refund_pending" && transaction.stripe_refund_id) {
      const existing = await runtime.retrieveRefund(transaction.stripe_refund_id, transaction.stripe_connect_account_id);
      if (!existing) return { status: 422, body: { error: "Stripe refund could not be confirmed" } };
      return await recordVerifiedRefund(runtime, transaction, existing);
    }
    if (transaction.status !== "succeeded") {
      return { status: 409, body: { error: "Only a succeeded Stripe payment can be refunded" } };
    }

    const created = await runtime.createRefund(
      transaction.stripe_payment_intent_id,
      `refund_${idempotencyKey}`,
      transaction.stripe_connect_account_id,
    );
    const confirmed = await runtime.retrieveRefund(created.id, transaction.stripe_connect_account_id);
    if (!confirmed || confirmed.id !== created.id) {
      return { status: 422, body: { error: "Stripe refund could not be confirmed" } };
    }
    return await recordVerifiedRefund(runtime, transaction, confirmed);
  } catch (err) {
    console.error("[stripe refund]", (err as Error).message);
    return { status: 500, body: { error: "Refund could not be recorded" } };
  }
}
