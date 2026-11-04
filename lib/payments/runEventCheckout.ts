import type Stripe from "stripe";
import {
  planParticipantCheckout,
  replacementLedgerIdempotencyKey,
  stripeCheckoutIdempotencyKey,
  type OpenPaymentRow,
} from "@/lib/payments/checkoutAttempt";
import { paymentBeneficiaryError } from "@/lib/payments/paymentBeneficiary";
import {
  PLATFORM_FEE_BASIS_POINTS,
  platformFeePence,
  type ProcessingFeeMode,
} from "@/lib/payments/processingFee";
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
  retrieveSession: (id: string, stripeAccount?: string | null) => Promise<CheckoutSessionSnapshot>;
  expireSession: (id: string, stripeAccount?: string | null) => Promise<void>;
  createSession: (
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
    stripeAccount?: string | null,
  ) => Promise<{ id: string; url: string | null }>;
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
  processingFeeMode?: ProcessingFeeMode;
  intendedFeePence?: number;
  estimatedProcessingFeePence?: number;
  platformFeeBasisPoints?: number;
  platformFeePence?: number;
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
  /** Snapshot of the payer society's processing-fee choice. */
  processingFeeMode?: ProcessingFeeMode;
  intendedFeePence?: number;
  estimatedProcessingFeePence?: number;
  platformFeeBasisPoints?: number;
  platformFeePence?: number;
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

function stripeAccountOptions(stripeAccount?: string | null): Stripe.RequestOptions | undefined {
  const account = stripeAccount?.trim() || "";
  return account ? { stripeAccount: account } : undefined;
}

function mapSession(session: Stripe.Checkout.Session): CheckoutSessionSnapshot {
  return {
    id: session.id,
    url: session.url,
    status: session.status,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
  };
}

export function stripeCheckoutAdapter(stripe: Stripe): CheckoutStripe {
  return {
    async retrieveSession(id, stripeAccount) {
      try {
        return mapSession(await stripe.checkout.sessions.retrieve(id, stripeAccountOptions(stripeAccount)));
      } catch (err) {
        if (!stripeAccount || classifyCheckoutRetrievalError(err) !== "missing") throw err;
        return mapSession(await stripe.checkout.sessions.retrieve(id));
      }
    },
    async expireSession(id, stripeAccount) {
      try {
        await stripe.checkout.sessions.expire(id, stripeAccountOptions(stripeAccount));
      } catch (err) {
        if (!stripeAccount || classifyCheckoutRetrievalError(err) !== "missing") throw err;
        await stripe.checkout.sessions.expire(id);
      }
    },
    async createSession(params, idempotencyKey, stripeAccount) {
      const session = await stripe.checkout.sessions.create(params, {
        idempotencyKey,
        ...stripeAccountOptions(stripeAccount),
      });
      return { id: session.id, url: session.url };
    },
  };
}

/** Connected account for a direct charge. Platform-only staging charges stay on the platform. */
export function directChargeStripeAccount(input: {
  platformCharge?: boolean;
  connectAccountId: string | null;
}): string | null {
  if (input.platformCharge) return null;
  return input.connectAccountId?.trim() || null;
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

export function paymentFeeSnapshot(input: {
  amountPence: number;
  processingFeeMode?: ProcessingFeeMode;
  intendedFeePence?: number;
  estimatedProcessingFeePence?: number;
  platformFeeBasisPoints?: number;
  platformFeePence?: number;
  platformCharge?: boolean;
}): {
  mode: ProcessingFeeMode;
  intendedPence: number;
  estimatedProcessingFeePence: number;
  grossPence: number;
  platformFeeBasisPoints: number;
  platformFeePence: number;
  applicationFeeAmount: number;
} {
  // Player pays is removed until a professional has reviewed UK surcharge rules.
  // A stored player_pays value does not add a line or change the charge.
  const mode: ProcessingFeeMode = "society_absorbs";
  const platformCharge = input.platformCharge === true;
  const estimated = 0;
  const intended = input.intendedFeePence ?? input.amountPence;
  const snapshotPlatformFee = platformCharge ? 0 : (input.platformFeePence ?? platformFeePence(intended));
  const snapshotBasisPoints = platformCharge ? 0 : (input.platformFeeBasisPoints ?? PLATFORM_FEE_BASIS_POINTS);
  return {
    mode,
    intendedPence: intended,
    estimatedProcessingFeePence: estimated,
    grossPence: input.amountPence,
    platformFeeBasisPoints: snapshotBasisPoints,
    platformFeePence: snapshotPlatformFee,
    applicationFeeAmount: platformCharge ? 0 : snapshotPlatformFee,
  };
}

export function sessionParams(input: RunCheckoutInput, transactionId: string): Stripe.Checkout.SessionCreateParams {
  const platformCharge = input.platformCharge === true;
  const fee = paymentFeeSnapshot(input);
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
          unit_amount: fee.intendedPence,
          product_data: { name: `Event entry - ${input.eventName || "Golf event"}` },
        },
      },
    ],
    // A staging platform charge has no Stripe-Account header and no application fee.
    // A Connect charge is a direct charge: application_fee_amount only.
    // The Stripe-Account header is passed separately. No transfer_data, no on_behalf_of.
    ...(platformCharge
      ? {}
      : {
          payment_intent_data: {
            ...(fee.applicationFeeAmount > 0 ? { application_fee_amount: fee.applicationFeeAmount } : {}),
          },
        }),
    metadata,
  };
}

function pendingPaymentRow(input: RunCheckoutInput, idempotencyKey: string): PendingPaymentInsert {
  const fee = paymentFeeSnapshot(input);
  return {
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
    idempotencyKey,
    stripeConnectAccountId: input.connectAccountId,
    processingFeeMode: fee.mode,
    intendedFeePence: fee.intendedPence,
    estimatedProcessingFeePence: fee.estimatedProcessingFeePence,
    platformFeeBasisPoints: fee.platformFeeBasisPoints,
    platformFeePence: fee.platformFeePence,
  };
}

export async function runEventCheckout(input: RunCheckoutInput): Promise<CreateCheckoutResult> {
  const ownSocietyError = paymentBeneficiaryError({
    payerSocietyId: input.societyId,
    beneficiarySocietyId: input.beneficiarySocietyId,
  });
  if (ownSocietyError) return { status: 403, body: { error: ownSocietyError } };

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
    const stripeAccount = directChargeStripeAccount(input);
    if (plan.sessionId) {
      try {
        found = await input.stripe.retrieveSession(plan.sessionId, stripeAccount);
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
          await input.stripe.expireSession(found.id, stripeAccount);
        } catch (err) {
          console.error("[checkout] expire session:", (err as Error).message);
          return { status: 409, body: { error: "The previous checkout could not be replaced yet" } };
        }
      }
      await input.store.cancelPending(plan.transactionId, "superseded_fee_change");
      transactionId = await input.store.insertPending(
        pendingPaymentRow(
          input,
          replacementLedgerIdempotencyKey(input.idempotencyKey, input.amountPence, plan.transactionId),
        ),
      );
      replacedSessionId = null;
    } else if (usability === "unusable" || usability === "missing" || usability === "none") {
      transactionId = plan.transactionId;
      replacedSessionId = plan.sessionId;
    } else {
      return { status: 503, body: { error: SESSION_UNKNOWN_ERROR } };
    }
  }

  if (!transactionId) {
    transactionId = await input.store.insertPending(pendingPaymentRow(input, input.idempotencyKey));
  }

  const session = await input.stripe.createSession(
    sessionParams(input, transactionId),
    stripeCheckoutIdempotencyKey(transactionId, replacedSessionId),
    directChargeStripeAccount(input),
  );
  await input.store.saveSessionId(transactionId, session.id);
  if (!session.url) return { status: 500, body: { error: "Stripe session missing url" } };
  return { status: 200, body: { url: session.url, sessionId: session.id, transactionId } };
}
