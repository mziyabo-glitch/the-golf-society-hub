import Stripe from "stripe";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import { assertUuid, validateSocietyPaymentsReady } from "@/lib/payments/checkoutValidation";
import { paymentBeneficiaryError } from "@/lib/payments/paymentBeneficiary";
import { quoteCheckoutCharge } from "@/lib/payments/processingFee";
import { resolveGuestCheckoutAmountPence } from "@/lib/payments/eventPricing";
import {
  assertStripeTestMode,
  buildCheckoutReturnUrls,
  serverAppBaseUrl,
  type OpenPaymentRow,
} from "@/lib/payments/checkoutAttempt";
import { createPaymentCheckoutStore } from "@/lib/payments/createCheckoutSessionHandler";
import {
  assessGuestCheckoutClaim,
  guestInvitationChargeBlock,
  hashGuestPaymentToken,
  isGuestPaymentToken,
  type GuestInvitationCheck,
} from "@/lib/payments/guestPaymentToken";
import { routeStagingCheckout, stagingPlatformChargeDecision } from "@/lib/payments/stagingPlatformCharge";
import {
  CheckoutConflictError,
  runEventCheckout,
  stripeCheckoutAdapter,
  type CheckoutStore,
  type CreateCheckoutResult,
  type RunCheckoutInput,
} from "@/lib/payments/runEventCheckout";

export type GuestCheckoutBody = {
  paymentToken: string;
  eventId: string;
  societyId: string;
  guestId: string;
  amountPence?: number;
};

export function parseGuestCheckoutBody(raw: unknown): GuestCheckoutBody | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const paymentToken = String(body.paymentToken ?? "").trim();
  const eventId = String(body.eventId ?? "").trim();
  const societyId = String(body.societyId ?? "").trim();
  const guestId = String(body.guestId ?? "").trim();
  if (!paymentToken || !eventId || !societyId || !guestId) return null;
  const amountRaw = body.amountPence;
  const amountPence = amountRaw == null || amountRaw === "" ? undefined : Number(amountRaw);
  if (amountPence != null && (!Number.isInteger(amountPence) || amountPence < 0)) return null;
  return { paymentToken, eventId, societyId, guestId, amountPence };
}

type GuestCheckoutContext = {
  invitation: GuestInvitationCheck | null;
  guest: { id: string; event_id: string; society_id: string; paid: boolean; name: string | null } | null;
  event: { id: string; society_id: string; name: string | null; date: string | null; guest_entry_fee_pence: number | null } | null;
  society: {
    id: string;
    name: string | null;
    online_payments_enabled: boolean | null;
    stripe_connect_account_id: string | null;
    stripe_connect_charges_enabled: boolean | null;
    processing_fee_mode?: string | null;
  } | null;
  rows: OpenPaymentRow[];
  keyed: OpenPaymentRow | null;
};

export type GuestCheckoutDeps = {
  stripeKey: string;
  env?: Record<string, string | undefined>;
  loadContext: (input: { tokenHash: string; idempotencyKey: string; guestId: string; eventId: string }) => Promise<GuestCheckoutContext>;
  markInvitationUsed: (guestId: string) => Promise<void>;
  stripe: RunCheckoutInput["stripe"];
  store: CheckoutStore;
};

const paymentSelect = "id, status, amount_pence, stripe_checkout_session_id, member_id, guest_id, idempotency_key";

function buildDefaultGuestCheckoutDeps(stripeKey: string): GuestCheckoutDeps {
  const stripe = new Stripe(stripeKey);
  const admin = getServiceRoleSupabase();
  return {
    stripeKey,
    stripe: stripeCheckoutAdapter(stripe),
    store: createPaymentCheckoutStore(admin),
    async markInvitationUsed(guestId) {
      const { error } = await admin
        .from("event_guest_payment_invitations")
        .update({ consumed_at: new Date().toISOString() })
        .eq("guest_id", guestId)
        .is("consumed_at", null);
      if (error) throw new Error(error.message);
    },
    async loadContext({ tokenHash, idempotencyKey, guestId, eventId }) {
      const { data: invitation, error: inviteErr } = await admin
        .from("event_guest_payment_invitations")
        .select("event_id, society_id, guest_id, expires_at, consumed_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (inviteErr) throw new Error(inviteErr.message);
      const { data: guest, error: guestErr } = await admin
        .from("event_guests")
        .select("id, event_id, society_id, paid, name")
        .eq("id", guestId)
        .maybeSingle();
      if (guestErr) throw new Error(guestErr.message);
      const { data: event, error: eventErr } = await admin
        .from("events")
        .select("id, society_id, name, date, guest_entry_fee_pence")
        .eq("id", eventId)
        .maybeSingle();
      if (eventErr) throw new Error(eventErr.message);
      const societyId = invitation?.society_id as string | undefined;
      const { data: society } = societyId
        ? await admin
            .from("societies")
            .select("id, name, online_payments_enabled, stripe_connect_account_id, stripe_connect_charges_enabled, processing_fee_mode")
            .eq("id", societyId)
            .maybeSingle()
        : { data: null };
      const { data: keyed, error: keyedErr } = await admin
        .from("payment_transactions")
        .select(paymentSelect)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (keyedErr) throw new Error(keyedErr.message);
      const { data: rows, error: rowsErr } = await admin
        .from("payment_transactions")
        .select(paymentSelect)
        .eq("event_id", eventId)
        .eq("guest_id", guestId)
        .in("status", ["pending", "succeeded", "refund_pending", "refunded"]);
      if (rowsErr) throw new Error(rowsErr.message);
      return {
        invitation: invitation
          ? {
              eventId: String(invitation.event_id),
              societyId: String(invitation.society_id),
              guestId: String(invitation.guest_id),
              expiresAt: String(invitation.expires_at),
              consumedAt: (invitation.consumed_at as string | null) ?? null,
            }
          : null,
        guest: guest
          ? {
              id: String(guest.id),
              event_id: String(guest.event_id),
              society_id: String(guest.society_id),
              paid: guest.paid === true,
              name: (guest.name as string | null) ?? null,
            }
          : null,
        event: event
          ? {
              id: String(event.id),
              society_id: String(event.society_id),
              name: (event.name as string | null) ?? null,
              date: (event.date as string | null) ?? null,
              guest_entry_fee_pence: (event.guest_entry_fee_pence as number | null) ?? null,
            }
          : null,
        society: society
          ? {
              id: String(society.id),
              name: (society.name as string | null) ?? null,
              online_payments_enabled: society.online_payments_enabled === true,
              stripe_connect_account_id: (society.stripe_connect_account_id as string | null) ?? null,
              stripe_connect_charges_enabled: society.stripe_connect_charges_enabled === true,
              processing_fee_mode: (society.processing_fee_mode as string | null) ?? null,
            }
          : null,
        rows: (rows ?? []) as OpenPaymentRow[],
        keyed: (keyed as OpenPaymentRow | null) ?? null,
      };
    },
  };
}

export async function handleCreateGuestCheckoutSession(
  input: {
    idempotencyKey: string | null | undefined;
    rawBody: unknown;
  },
  deps?: GuestCheckoutDeps,
): Promise<CreateCheckoutResult> {
  try {
    const body = parseGuestCheckoutBody(input.rawBody);
    if (!body) return { status: 400, body: { error: "Invalid request body" } };
    if (!isGuestPaymentToken(body.paymentToken)) return { status: 401, body: { error: "Invalid invitation" } };
    try {
      assertUuid(body.eventId, "eventId");
      assertUuid(body.societyId, "societyId");
      assertUuid(body.guestId, "guestId");
    } catch (err) {
      return { status: 400, body: { error: (err as Error).message } };
    }
    const idempotencyKey = input.idempotencyKey?.trim() ?? "";
    if (idempotencyKey.length < 8) return { status: 400, body: { error: "Missing Idempotency-Key header" } };

    const stripeKey = deps?.stripeKey ?? process.env.STRIPE_SECRET_KEY;
    const testModeError = assertStripeTestMode(stripeKey);
    if (testModeError) return { status: 403, body: { error: testModeError } };

    const runtime = deps ?? buildDefaultGuestCheckoutDeps(stripeKey as string);
    const context = await runtime.loadContext({
      tokenHash: hashGuestPaymentToken(body.paymentToken.trim().toLowerCase()),
      idempotencyKey,
      guestId: body.guestId,
      eventId: body.eventId,
    });
    const serverAmount = context.event ? resolveGuestCheckoutAmountPence(context.event) : null;
    const claim = assessGuestCheckoutClaim({
      invitation: context.invitation,
      claim: body,
      serverAmountPence: serverAmount,
    });
    if (!claim.ok) return { status: claim.status, body: { error: claim.error } };

    const guest = context.guest;
    if (!guest || guest.id !== context.invitation?.guestId || guest.event_id !== body.eventId) {
      return { status: 404, body: { error: "Guest not found" } };
    }
    if (guest.society_id !== body.societyId) return { status: 403, body: { error: "Guest belongs to another society" } };
    if (guest.paid) return { status: 409, body: { error: "Already paid" } };

    if (!context.society || !context.society.online_payments_enabled) {
      return { status: 403, body: { error: "Online payments are not enabled for this society." } };
    }
    const routeError = paymentBeneficiaryError({
      payerSocietyId: body.societyId,
      beneficiarySocietyId: context.society.id,
    });
    if (routeError) return { status: 403, body: { error: routeError } };
    const stagingDecision = stagingPlatformChargeDecision({
      env: deps?.env ?? process.env,
      stripeKey,
      chargesEnabled: context.society.stripe_connect_charges_enabled === true,
      connectAccountId: context.society.stripe_connect_account_id,
    });
    if (stagingDecision.mode === "refused") return { status: 403, body: { error: stagingDecision.reason } };
    if (stagingDecision.mode !== "platform") {
      const societyError = validateSocietyPaymentsReady(context.society);
      if (societyError) return { status: 403, body: { error: societyError } };
      if (!context.society.stripe_connect_account_id || !context.society.stripe_connect_charges_enabled) {
        return { status: 403, body: { error: "Payment beneficiary Connect account is not ready" } };
      }
    }
    if (context.keyed && context.keyed.guest_id !== guest.id) {
      return { status: 409, body: { error: "Idempotency key belongs to another payer" } };
    }

    const block = guestInvitationChargeBlock(context.rows);
    if (block) {
      await runtime.markInvitationUsed(guest.id);
      if (block === "paid") return { status: 409, body: { error: "Already paid" } };
      if (block === "refund_pending") return { status: 409, body: { error: "A refund is already in progress" } };
      return { status: 409, body: { error: "This invitation has already been used" } };
    }

    const urls = buildCheckoutReturnUrls(body.eventId, serverAppBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_URL));
    const openRows = context.rows.filter((row) => row.status === "pending" || row.status === "succeeded" || row.status === "refund_pending");
    const processingQuote = quoteCheckoutCharge(claim.amountPence, context.society.processing_fee_mode);
    const routed = routeStagingCheckout(
      {
        amountPence: processingQuote.grossPence,
        processingFeeMode: processingQuote.mode,
        intendedFeePence: processingQuote.intendedPence,
        estimatedProcessingFeePence: processingQuote.estimatedProcessingFeePence,
        idempotencyKey,
        payerType: "guest" as const,
        memberId: null,
        guestId: guest.id,
        eventId: body.eventId,
        societyId: body.societyId,
        beneficiarySocietyId: context.society.id,
        societyName: String(context.society.name || "Society"),
        beneficiarySocietyName: String(context.society.name || "Society"),
        eventName: String(context.event?.name || "Golf event"),
        eventDateSnapshot: context.event?.date ? String(context.event.date) : null,
        payerDisplayName: String(guest.name || "Guest"),
        connectAccountId: context.society.stripe_connect_account_id,
        beneficiaryChargesEnabled: context.society.stripe_connect_charges_enabled === true,
        successUrl: urls.successUrl,
        cancelUrl: urls.cancelUrl,
        rows: openRows,
        keyed: context.keyed,
      },
      deps?.env ?? process.env,
      stripeKey,
    );
    if (!routed.ok) return { status: 403, body: { error: routed.error } };
    return await runEventCheckout({
      ...routed.checkout,
      stripe: runtime.stripe,
      store: runtime.store,
    });
  } catch (err) {
    if (err instanceof CheckoutConflictError) return { status: 409, body: { error: err.message } };
    console.error("[guest checkout] unexpected:", err);
    return { status: 500, body: { error: "Checkout failed" } };
  }
}
