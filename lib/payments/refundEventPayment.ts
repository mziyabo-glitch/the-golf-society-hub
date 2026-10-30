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
  stripe_refund_id: string | null;
  amount_pence: number;
  currency: string;
};

type RefundDeps = {
  stripeKey: string;
  getUserId: (accessToken: string) => Promise<string | null>;
  loadCallerRole: (userId: string, societyId: string) => Promise<string | null>;
  loadTransaction: (id: string) => Promise<RefundTransaction | null>;
  createRefund: (paymentIntentId: string, idempotencyKey: string) => Promise<StripeRefundCheck>;
  retrieveRefund: (refundId: string) => Promise<StripeRefundCheck | null>;
  recordRefund: (transactionId: string, refundId: string, status: RefundRecordStatus) => Promise<void>;
};

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
        .select("id, society_id, status, payment_method, stripe_payment_intent_id, stripe_refund_id, amount_pence, currency")
        .eq("id", id)
        .maybeSingle();
      return (data as RefundTransaction | null) ?? null;
    },
    async createRefund(paymentIntentId, idempotencyKey) {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
      const refund = await stripe.refunds.create(
        { payment_intent: paymentIntentId, reverse_transfer: true },
        { idempotencyKey },
      );
      return mapRefund(refund);
    },
    async retrieveRefund(refundId) {
      if (!stripe) throw new Error("STRIPE_SECRET_KEY is not configured");
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
      const existing = await runtime.retrieveRefund(transaction.stripe_refund_id);
      if (!existing) return { status: 422, body: { error: "Stripe refund could not be confirmed" } };
      return await recordVerifiedRefund(runtime, transaction, existing);
    }
    if (transaction.status !== "succeeded") {
      return { status: 409, body: { error: "Only a succeeded Stripe payment can be refunded" } };
    }

    const created = await runtime.createRefund(transaction.stripe_payment_intent_id, `refund_${idempotencyKey}`);
    const confirmed = await runtime.retrieveRefund(created.id);
    if (!confirmed || confirmed.id !== created.id) {
      return { status: 422, body: { error: "Stripe refund could not be confirmed" } };
    }
    return await recordVerifiedRefund(runtime, transaction, confirmed);
  } catch (err) {
    console.error("[stripe refund]", (err as Error).message);
    return { status: 500, body: { error: "Refund could not be recorded" } };
  }
}
