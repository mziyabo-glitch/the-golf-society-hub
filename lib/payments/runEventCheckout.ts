import type Stripe from "stripe";
import {
  planParticipantCheckout,
  replacementLedgerIdempotencyKey,
  stripeCheckoutIdempotencyKey,
  type OpenPaymentRow,
} from "@/lib/payments/checkoutAttempt";
import {
  STAGING_PLATFORM_CHARGE_METADATA_KEY,
  STAGING_PLATFORM_CHARGE_METADATA_VALUE,
  STAGING_PLATFORM_CHARGE_ROUTE,
} from "@/lib/payments/stagingPlatformCharge";

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
  stripeConnectAccountId: string | null;
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
  connectAccountId: string | null;
  /** True only when the beneficiary Connect account can already take charges. */
  beneficiaryChargesEnabled?: boolean;
  /** Staging-only direct charge on the platform account. No Connect transfer. */
  platformCharge?: boolean;
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

const SESSION_UNKNOWN_ERROR =
  "Stripe checkout status is temporarily unavailable. Try again once the existing session can be confirmed.";

/**
 * A timeout, 5xx, or network failure is not proof the Checkout session is gone.
 * Only Stripe's resource_missing (or HTTP 404) means the session is missing.
 */
export function classifyCheckoutRetrievalError(err: unknown): "missing" | "unknown" {
  const error = err as { statusCode?: number; code?: string; message?: string };
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  if (code === "resource_missing" || error?.statusCode === 404 || message.includes("no such checkout.session")) {
    return "missing";
  }
  return "unknown";
}

type SessionUsability = "open" | "paid" | "unusable" | "unknown";

function sessionUsability(session: CheckoutSessionSnapshot): SessionUsability {
  const status = (session.status ?? "").toLowerCase();
  const payment = (session.payment_status ?? "").toLowerCase();
  if (payment === "paid") return "paid";
  if (status === "open") return "open";
  if (status === "expired" || status === "canceled" || status === "cancelled") return "unusable";
  if (status === "complete") return "unusable";
  return "unknown";
}

export function sessionParams(input: RunCheckoutInput, transactionId: string): Stripe.Checkout.SessionCreateParams {
  const platformCharge = input.platformCharge === true;
  const metadata: Stripe.MetadataParam = {
    payment_transaction_id: transactionId,
    event_id: input.eventId,
    society_id: input.societyId,
    beneficiary_society_id: input.beneficiarySocietyId,
    payer_type: input.payerType,
    member_id: input.memberId ?? "",
    guest_id: input.guestId ?? "",
  };
  if (platformCharge) {
    metadata[STAGING_PLATFORM_CHARGE_METADATA_KEY] = STAGING_PLATFORM_CHARGE_METADATA_VALUE;
    metadata.charge_route = STAGING_PLATFORM_CHARGE_ROUTE;
  }
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
    // A staging platform charge must not set transfer_data, on_behalf_of, or application_fee_amount.
    ...(platformCharge
      ? {}
      : {
          payment_intent_data: {
            transfer_data: { destination: input.connectAccountId ?? "" },
          },
        }),
    metadata,
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
    let found: CheckoutSessionSnapshot | null = null;
    let usability: SessionUsability | "missing" | "none" = "none";
    if (plan.sessionId) {
      try {
        found = await input.stripe.retrieveSession(plan.sessionId);
        usability = sessionUsability(found);
      } catch (err) {
        if (classifyCheckoutRetrievalError(err) === "missing") {
          usability = "missing";
        } else {
          console.error("[checkout] retrieve session:", (err as Error).message);
          return { status: 503, body: { error: SESSION_UNKNOWN_ERROR } };
        }
      }
    }
    if (usability === "paid") return { status: 409, body: { error: "Already paid" } };

    const stripeAmountMismatch = found?.amount_total != null && found.amount_total !== input.amountPence;
    const supersede = plan.action === "supersede" || stripeAmountMismatch;

    if (!supersede && usability === "open" && found) {
      if (found.url) {
        return {
          status: 200,
          body: { url: found.url, sessionId: found.id, transactionId: plan.transactionId },
        };
      }
      return { status: 503, body: { error: "The existing checkout is still open. Try again shortly." } };
    }

    if (supersede) {
      if (usability === "unknown") {
        return { status: 503, body: { error: SESSION_UNKNOWN_ERROR } };
      }
      if (usability === "open" && found) {
        try {
          await input.stripe.expireSession(found.id);
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
    } else if (usability === "unusable" || usability === "missing" || usability === "none") {
      transactionId = plan.transactionId;
      replacedSessionId = plan.sessionId;
    } else {
      return { status: 503, body: { error: SESSION_UNKNOWN_ERROR } };
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
