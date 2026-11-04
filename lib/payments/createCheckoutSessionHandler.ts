import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import {
  parseCheckoutRequestBody,
  validateSocietyPaymentsReady,
  assertUuid,
  type CheckoutRequestBody,
} from "@/lib/payments/checkoutValidation";
import { resolveMemberCheckoutAmountPence } from "@/lib/payments/eventPricing";
import {
  assertStripeTestMode,
  buildCheckoutReturnUrls,
  checkoutBelongsToPayer,
  serverAppBaseUrl,
  type OpenPaymentRow,
} from "@/lib/payments/checkoutAttempt";
import { assessMemberCheckoutEligibility } from "@/lib/payments/memberCheckoutEligibility";
import { paymentBeneficiaryError } from "@/lib/payments/paymentBeneficiary";
import { quoteCheckoutCharge } from "@/lib/payments/processingFee";
import { routeStagingCheckout, stagingPlatformChargeDecision } from "@/lib/payments/stagingPlatformCharge";
import {
  CheckoutConflictError,
  runEventCheckout,
  stripeCheckoutAdapter,
  type CheckoutStore,
  type CreateCheckoutResult,
  type PendingPaymentInsert,
  type RunCheckoutInput,
} from "@/lib/payments/runEventCheckout";

export type { CreateCheckoutResult };

function getUserSupabase(accessToken: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase URL/anon key missing");
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const paymentSelect =
  "id, status, amount_pence, stripe_checkout_session_id, member_id, guest_id, idempotency_key";

export function createPaymentCheckoutStore(admin: ReturnType<typeof getServiceRoleSupabase>): CheckoutStore {
  return {
    async cancelPending(id, reason) {
      const { data, error } = await admin
        .from("payment_transactions")
        .update({ status: "canceled", failure_reason: reason })
        .eq("id", id)
        .eq("status", "pending")
        .select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new CheckoutConflictError("A payment is already in progress");
    },
    async insertPending(row: PendingPaymentInsert) {
      const { data, error } = await admin
        .from("payment_transactions")
        .insert({
          society_id: row.societyId,
          beneficiary_society_id: row.beneficiarySocietyId,
          event_id: row.eventId,
          payer_type: row.payerType,
          member_id: row.memberId,
          guest_id: row.guestId,
          society_name: row.societyName,
          beneficiary_society_name: row.beneficiarySocietyName,
          event_name: row.eventName,
          event_date_snapshot: row.eventDateSnapshot,
          payer_display_name: row.payerDisplayName,
          amount_pence: row.amountPence,
          currency: "gbp",
          status: "pending",
          payment_method: "stripe",
          idempotency_key: row.idempotencyKey,
          stripe_connect_account_id: row.stripeConnectAccountId,
          processing_fee_mode: row.processingFeeMode ?? "society_absorbs",
          intended_fee_pence: row.intendedFeePence ?? row.amountPence,
          estimated_processing_fee_pence: row.estimatedProcessingFeePence ?? 0,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") throw new CheckoutConflictError("A payment is already in progress");
        throw new Error(error.message);
      }
      return data.id as string;
    },
    async saveSessionId(id, sessionId) {
      const { error } = await admin
        .from("payment_transactions")
        .update({ stripe_checkout_session_id: sessionId })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
    },
  };
}

export type MemberCheckoutDeps = {
  stripeKey: string;
  env?: Record<string, string | undefined>;
  prepare: (input: {
    accessToken: string;
    idempotencyKey: string;
    body: CheckoutRequestBody;
  }) => Promise<{ ok: false; result: CreateCheckoutResult } | { ok: true; checkout: Omit<RunCheckoutInput, "stripe" | "store"> }>;
  stripe: RunCheckoutInput["stripe"];
  store: CheckoutStore;
};

function buildDefaultMemberCheckoutDeps(stripeKey: string): MemberCheckoutDeps {
  const stripe = new Stripe(stripeKey);
  const admin = getServiceRoleSupabase();
  return {
    stripeKey,
    stripe: stripeCheckoutAdapter(stripe),
    store: createPaymentCheckoutStore(admin),
    async prepare({ accessToken, idempotencyKey, body }) {
      const userClient = getUserSupabase(accessToken);
      const { data: userData, error: userErr } = await userClient.auth.getUser(accessToken);
      if (userErr || !userData.user) return { ok: false, result: { status: 401, body: { error: "Invalid session" } } };

      const { data: event, error: eventErr } = await admin
        .from("events")
        .select("id, society_id, name, date, member_entry_fee_pence, guest_entry_fee_pence, joint_participant_entry_fee_pence, rsvp_deadline_at, player_ids")
        .eq("id", body.eventId)
        .maybeSingle();
      if (eventErr || !event) return { ok: false, result: { status: 404, body: { error: "Event not found" } } };

      const hostSocietyId = String(event.society_id);
      const { data: links, error: linkErr } = await admin
        .from("event_societies")
        .select("society_id")
        .eq("event_id", body.eventId);
      if (linkErr) throw new Error(linkErr.message);
      const participatingSocietyIds = (links ?? []).map((link) => String(link.society_id));
      const eventAllowed = body.societyId === hostSocietyId || participatingSocietyIds.includes(body.societyId);
      if (!eventAllowed) return { ok: false, result: { status: 403, body: { error: "Society is not part of this event" } } };

      const { data: society, error: socErr } = await admin
        .from("societies")
        .select("id, name, online_payments_enabled, stripe_connect_account_id, stripe_connect_charges_enabled, event_bank_transfer_instructions, processing_fee_mode")
        .eq("id", body.societyId)
        .maybeSingle();
      if (socErr || !society) return { ok: false, result: { status: 404, body: { error: "Society not found" } } };

      const beneficiarySocietyId = body.societyId;
      const beneficiaryRouteError = paymentBeneficiaryError({
        payerSocietyId: body.societyId,
        beneficiarySocietyId,
      });
      if (beneficiaryRouteError) return { ok: false, result: { status: 403, body: { error: beneficiaryRouteError } } };
      const beneficiaryChargesEnabled = society.stripe_connect_charges_enabled === true;
      const beneficiaryConnectAccountId = (society.stripe_connect_account_id as string | null) ?? null;
      const stagingDecision = stagingPlatformChargeDecision({
        env: process.env,
        stripeKey,
        chargesEnabled: beneficiaryChargesEnabled,
        connectAccountId: beneficiaryConnectAccountId,
      });
      if (stagingDecision.mode === "refused") {
        return { ok: false, result: { status: 403, body: { error: stagingDecision.reason } } };
      }
      if (!society.online_payments_enabled) {
        return { ok: false, result: { status: 403, body: { error: "Online payments are not enabled for this society." } } };
      }
      if (stagingDecision.mode !== "platform") {
        const societyReadyErr = validateSocietyPaymentsReady(society);
        if (societyReadyErr) return { ok: false, result: { status: 403, body: { error: societyReadyErr } } };
        if (!beneficiaryConnectAccountId || !beneficiaryChargesEnabled) {
          return { ok: false, result: { status: 403, body: { error: "Payment beneficiary Connect account is not ready" } } };
        }
      }

      const { data: callerMember } = await admin
        .from("members")
        .select("id, display_name")
        .eq("society_id", body.societyId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!callerMember?.id) return { ok: false, result: { status: 403, body: { error: "Not a member of this society" } } };

      const amountPence = resolveMemberCheckoutAmountPence(event, {
        isJointParticipantSociety: body.societyId !== hostSocietyId,
      });
      const memberId = callerMember.id as string;
      const { data: reg } = await admin
        .from("event_registrations")
        .select("status, paid, removed_from_event_at")
        .eq("event_id", body.eventId)
        .eq("member_id", memberId)
        .maybeSingle();
      if (reg?.paid) return { ok: false, result: { status: 409, body: { error: "Already paid" } } };
      const entryResult = await admin
        .from("event_entries")
        .select("status")
        .eq("event_id", body.eventId)
        .eq("player_id", memberId)
        .maybeSingle();
      if (
        entryResult.error &&
        !/event_entries|schema cache|does not exist|could not find/i.test(entryResult.error.message)
      ) {
        throw new Error(entryResult.error.message);
      }
      const playerIds = Array.isArray(event.player_ids) ? (event.player_ids as string[]) : [];
      const eligibility = assessMemberCheckoutEligibility({
        memberId,
        registration: reg
          ? {
              status: String(reg.status),
              removed_from_event_at: (reg.removed_from_event_at as string | null) ?? null,
            }
          : null,
        playerIds,
        eventEntryStatus: entryResult.error ? null : ((entryResult.data?.status as string | null) ?? null),
        rsvpDeadlineAt: (event.rsvp_deadline_at as string | null) ?? null,
      });
      if (!eligibility.ok) return { ok: false, result: { status: eligibility.status, body: { error: eligibility.error } } };
      if (amountPence == null || amountPence <= 0) {
        return { ok: false, result: { status: 400, body: { error: "Event fee is not configured for online payment" } } };
      }
      const processingQuote = quoteCheckoutCharge(amountPence, society.processing_fee_mode as string | null);

      const { data: keyed } = await admin
        .from("payment_transactions")
        .select(paymentSelect)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (keyed && !checkoutBelongsToPayer(keyed, { payerType: "member", memberId, guestId: null })) {
        return { ok: false, result: { status: 409, body: { error: "Idempotency key belongs to another payer" } } };
      }

      const { data: participantRows, error: rowsErr } = await admin
        .from("payment_transactions")
        .select(paymentSelect)
        .eq("event_id", body.eventId)
        .eq("member_id", memberId)
        .in("status", ["pending", "succeeded", "refund_pending"]);
      if (rowsErr) throw new Error(rowsErr.message);

      const urls = buildCheckoutReturnUrls(body.eventId, serverAppBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_URL));
      return {
        ok: true,
        checkout: {
          amountPence: processingQuote.grossPence,
          processingFeeMode: processingQuote.mode,
          intendedFeePence: processingQuote.intendedPence,
          estimatedProcessingFeePence: processingQuote.estimatedProcessingFeePence,
          idempotencyKey,
          payerType: "member",
          memberId,
          guestId: null,
          eventId: body.eventId,
          societyId: body.societyId,
          beneficiarySocietyId,
          societyName: String(society.name || "Society"),
          beneficiarySocietyName: String(society.name || "Society"),
          eventName: String(event.name || "Golf event"),
          eventDateSnapshot: event.date ? String(event.date) : null,
          payerDisplayName: String(callerMember.display_name || "Member"),
          connectAccountId: beneficiaryConnectAccountId,
          beneficiaryChargesEnabled,
          successUrl: urls.successUrl,
          cancelUrl: urls.cancelUrl,
          rows: (participantRows ?? []) as OpenPaymentRow[],
          keyed: (keyed as OpenPaymentRow | null) ?? null,
        },
      };
    },
  };
}

export async function handleCreateEventCheckoutSession(
  input: {
    authorizationHeader: string | null | undefined;
    idempotencyKey: string | null | undefined;
    rawBody: unknown;
  },
  deps?: MemberCheckoutDeps,
): Promise<CreateCheckoutResult> {
  try {
    const body = parseCheckoutRequestBody(input.rawBody);
    if (!body) return { status: 400, body: { error: "Invalid request body" } };
    if (body.payerType === "guest" || body.guestId) {
      return { status: 400, body: { error: "Guest payments require an invitation token" } };
    }

    try {
      assertUuid(body.eventId, "eventId");
      assertUuid(body.societyId, "societyId");
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }

    const stripeKey = deps?.stripeKey ?? process.env.STRIPE_SECRET_KEY;
    const testModeError = assertStripeTestMode(stripeKey);
    if (testModeError) return { status: 403, body: { error: testModeError } };

    const token = input.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return { status: 401, body: { error: "Missing authorization" } };
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return { status: 400, body: { error: "Missing Idempotency-Key header" } };
    }

    const runtime = deps ?? buildDefaultMemberCheckoutDeps(stripeKey as string);
    const prepared = await runtime.prepare({ accessToken: token, idempotencyKey, body });
    if (!prepared.ok) return prepared.result;
    const routed = routeStagingCheckout(prepared.checkout, deps?.env ?? process.env, stripeKey);
    if (!routed.ok) return { status: 403, body: { error: routed.error } };
    return await runEventCheckout({ ...routed.checkout, stripe: runtime.stripe, store: runtime.store });
  } catch (err) {
    if (err instanceof CheckoutConflictError) return { status: 409, body: { error: err.message } };
    console.error("[checkout] unexpected:", err);
    return { status: 500, body: { error: "Checkout failed" } };
  }
}

export type { CheckoutRequestBody };
