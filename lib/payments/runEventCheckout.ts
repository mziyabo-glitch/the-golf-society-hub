import type Stripe from "stripe";
import {
  planParticipantCheckout,
  replacementLedgerIdempotencyKey,
  stripeCheckoutIdempotencyKey,
  type OpenPaymentRow,
} from "@/lib/payments/checkoutAttempt";

export type CreateCheckoutResult =
  | { status: number; body: { url: string; sessionId: string; transactionId: string } }
  | { status: number; body: { error: string } };

export class CheckoutConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutConflictError";
  }
}

export type CheckoutSessionSnapshot = {
  id: string;
  url: string | null;
  status: string | null;
  payment_status: string | null;
  amount_total: number | null;
};

export type CheckoutStripe = {
  retrieveSession: (id: string) => Promise<CheckoutSessionSnapshot>;
  expireSession: (id: string) => Promise<void>;
  createSession: (params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string) => Promise<{ id: string; url: string | null }>;
};

export type PendingPaymentInsert = {
  societyId: string;
  beneficiarySocietyId: string;
  eventId: string;
  payerType: "member" | "guest";
  memberId: string | null;
  guestId: string | null;
  societyName: string;
  beneficiarySocietyName: string;
  eventName: string;
  eventDateSnapshot: string | null;
  payerDisplayName: string;
  amountPence: number;
  idempotencyKey: string;
  stripeConnectAccountId: string;
};

export type CheckoutStore = {
  cancelPending: (id: string, reason: string) => Promise<void>;
  insertPending: (row: PendingPaymentInsert) => Promise<string>;
  saveSessionId: (id: string, sessionId: string) => Promise<void>;
};

export type RunCheckoutInput = {
  amountPence: number;
  idempotencyKey: string;
  payerType: "member" | "guest";
  memberId: string | null;
  guestId: string | null;
  eventId: string;
  societyId: string;
  beneficiarySocietyId: string;
  societyName: string;
  beneficiarySocietyName: string;
  eventName: string;
  eventDateSnapshot: string | null;
  payerDisplayName: string;
  connectAccountId: string;
  successUrl: string;
  cancelUrl: string;
  rows: OpenPaymentRow[];
  keyed: OpenPaymentRow | null;
  stripe: CheckoutStripe;
  store: CheckoutStore;
};

export function stripeCheckoutAdapter(stripe: Stripe): CheckoutStripe {
  return {
    async retrieveSession(id) {
      const session = await stripe.checkout.sessions.retrieve(id);
      return {
        id: session.id,
        url: session.url,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
      };
    },
    async expireSession(id) {
      await stripe.checkout.sessions.expire(id);
    },
    async createSession(params, idempotencyKey) {
      const session = await stripe.checkout.sessions.create(params, { idempotencyKey });
      return { id: session.id, url: session.url };
    },
  };
}

function sessionParams(input: RunCheckoutInput, transactionId: string): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: transactionId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: input.amountPence,
          product_data: { name: `Event entry - ${input.eventName || "Golf event"}` },
        },
      },
    ],
    payment_intent_data: {
      transfer_data: { destination: input.connectAccountId },
    },
    metadata: {
      payment_transaction_id: transactionId,
      event_id: input.eventId,
      society_id: input.societyId,
      beneficiary_society_id: input.beneficiarySocietyId,
      payer_type: input.payerType,
      member_id: input.memberId ?? "",
      guest_id: input.guestId ?? "",
    },
  };
}

export async function runEventCheckout(input: RunCheckoutInput): Promise<CreateCheckoutResult> {
  const rows =
    input.keyed && !input.rows.some((row) => row.id === input.keyed?.id) ? [input.keyed, ...input.rows] : input.rows;
  const plan = planParticipantCheckout(rows, input.amountPence);
  if (plan.action === "already_paid") return { status: 409, body: { error: "Already paid" } };
  if (plan.action === "blocked") return { status: 409, body: { error: "A refund is already in progress" } };

  let transactionId = plan.action === "create" ? "" : plan.transactionId;
  let replacedSessionId: string | null = null;

  if (plan.action === "reuse" || plan.action === "supersede") {
    let session: CheckoutSessionSnapshot | null = null;
    if (plan.sessionId) {
      try {
        session = await input.stripe.retrieveSession(plan.sessionId);
      } catch (err) {
        console.error("[checkout] retrieve session:", (err as Error).message);
        session = null;
      }
    }
    if (session?.payment_status === "paid") return { status: 409, body: { error: "Already paid" } };

    const openUrl = session?.status === "open" && session.url ? session.url : null;
    const stripeAmountMismatch = session?.amount_total != null && session.amount_total !== input.amountPence;
    const supersede = plan.action === "supersede" || stripeAmountMismatch;

    if (!supersede && openUrl && session) {
      return {
        status: 200,
        body: { url: openUrl, sessionId: session.id, transactionId: plan.transactionId },
      };
    }

    if (supersede) {
      if (session?.status === "open") {
        try {
          await input.stripe.expireSession(session.id);
        } catch (err) {
          console.error("[checkout] expire session:", (err as Error).message);
          return { status: 409, body: { error: "The previous checkout could not be replaced yet" } };
        }
      }
      await input.store.cancelPending(plan.transactionId, "superseded_fee_change");
      transactionId = await input.store.insertPending({
        societyId: input.societyId,
        beneficiarySocietyId: input.beneficiarySocietyId,
        eventId: input.eventId,
        payerType: input.payerType,
        memberId: input.memberId,
        guestId: input.guestId,
        societyName: input.societyName,
        beneficiarySocietyName: input.beneficiarySocietyName,
        eventName: input.eventName,
        eventDateSnapshot: input.eventDateSnapshot,
        payerDisplayName: input.payerDisplayName,
        amountPence: input.amountPence,
        idempotencyKey: replacementLedgerIdempotencyKey(input.idempotencyKey, input.amountPence, plan.transactionId),
        stripeConnectAccountId: input.connectAccountId,
      });
      replacedSessionId = null;
    } else {
      transactionId = plan.transactionId;
      replacedSessionId = plan.sessionId;
    }
  }

  if (!transactionId) {
    transactionId = await input.store.insertPending({
      societyId: input.societyId,
      beneficiarySocietyId: input.beneficiarySocietyId,
      eventId: input.eventId,
      payerType: input.payerType,
      memberId: input.memberId,
      guestId: input.guestId,
      societyName: input.societyName,
      beneficiarySocietyName: input.beneficiarySocietyName,
      eventName: input.eventName,
      eventDateSnapshot: input.eventDateSnapshot,
      payerDisplayName: input.payerDisplayName,
      amountPence: input.amountPence,
      idempotencyKey: input.idempotencyKey,
      stripeConnectAccountId: input.connectAccountId,
    });
  }

  const session = await input.stripe.createSession(
    sessionParams(input, transactionId),
    stripeCheckoutIdempotencyKey(transactionId, replacedSessionId),
  );
  await input.store.saveSessionId(transactionId, session.id);
  if (!session.url) return { status: 500, body: { error: "Stripe session missing url" } };
  return { status: 200, body: { url: session.url, sessionId: session.id, transactionId } };
}
