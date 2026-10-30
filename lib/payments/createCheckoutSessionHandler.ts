import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleSupabase } from "@/lib/server/supabaseServiceRole";
import {
  parseCheckoutRequestBody,
  validateSocietyPaymentsReady,
  assertUuid,
  type CheckoutRequestBody,
} from "@/lib/payments/checkoutValidation";
import { resolveGuestCheckoutAmountPence, resolveMemberCheckoutAmountPence } from "@/lib/payments/eventPricing";
import {
  buildCheckoutReturnUrls,
  checkoutBelongsToPayer,
  selectParticipantCheckout,
  serverAppBaseUrl,
  type OpenPaymentRow,
} from "@/lib/payments/checkoutAttempt";

export type CreateCheckoutResult =
  | { status: number; body: { url: string; sessionId: string; transactionId: string } }
  | { status: number; body: { error: string } };

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key);
}

function getUserSupabase(accessToken: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("Supabase URL/anon key missing");
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveBeneficiarySocietyId(
  admin: ReturnType<typeof getServiceRoleSupabase>,
  eventId: string,
  registrationSocietyId: string,
  hostSocietyId: string,
): Promise<string> {
  const { data: link } = await admin
    .from("event_societies")
    .select("payment_beneficiary_society_id")
    .eq("event_id", eventId)
    .eq("society_id", registrationSocietyId)
    .maybeSingle();
  const beneficiary = link?.payment_beneficiary_society_id as string | null | undefined;
  if (beneficiary) return beneficiary;
  return hostSocietyId;
}

async function loadParticipantPayments(
  admin: ReturnType<typeof getServiceRoleSupabase>,
  eventId: string,
  payerType: "member" | "guest",
  payerId: string,
): Promise<OpenPaymentRow[]> {
  const column = payerType === "member" ? "member_id" : "guest_id";
  const { data, error } = await admin
    .from("payment_transactions")
    .select("id, status, stripe_checkout_session_id, member_id, guest_id, idempotency_key")
    .eq("event_id", eventId)
    .eq(column, payerId)
    .in("status", ["pending", "succeeded"]);
  if (error) throw new Error(error.message);
  return (data ?? []) as OpenPaymentRow[];
}

export async function handleCreateEventCheckoutSession(input: {
  authorizationHeader: string | null | undefined;
  idempotencyKey: string | null | undefined;
  rawBody: unknown;
}): Promise<CreateCheckoutResult> {
  try {
    const token = input.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return { status: 401, body: { error: "Missing authorization" } };

    const body = parseCheckoutRequestBody(input.rawBody);
    if (!body) return { status: 400, body: { error: "Invalid request body" } };

    try {
      assertUuid(body.eventId, "eventId");
      assertUuid(body.societyId, "societyId");
      if (body.guestId) assertUuid(body.guestId, "guestId");
    } catch (e) {
      return { status: 400, body: { error: (e as Error).message } };
    }

    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length < 8) {
      return { status: 400, body: { error: "Missing Idempotency-Key header" } };
    }

    const userClient = getUserSupabase(token);
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData.user) return { status: 401, body: { error: "Invalid session" } };

    const admin = getServiceRoleSupabase();
    const { data: event, error: eventErr } = await admin
      .from("events")
      .select(
        "id, society_id, name, date, member_entry_fee_pence, guest_entry_fee_pence, joint_participant_entry_fee_pence",
      )
      .eq("id", body.eventId)
      .maybeSingle();
    if (eventErr || !event) return { status: 404, body: { error: "Event not found" } };

    const hostSocietyId = String(event.society_id);
    const eventAllowed =
      body.societyId === hostSocietyId ||
      (
        await admin
          .from("event_societies")
          .select("society_id")
          .eq("event_id", body.eventId)
          .eq("society_id", body.societyId)
          .maybeSingle()
      ).data != null;
    if (!eventAllowed) return { status: 403, body: { error: "Society is not part of this event" } };

    const { data: society, error: socErr } = await admin
      .from("societies")
      .select(
        "id, name, online_payments_enabled, stripe_connect_account_id, stripe_connect_charges_enabled, event_bank_transfer_instructions",
      )
      .eq("id", body.societyId)
      .maybeSingle();
    if (socErr || !society) return { status: 404, body: { error: "Society not found" } };

    const societyReadyErr = validateSocietyPaymentsReady(society);
    if (societyReadyErr) return { status: 403, body: { error: societyReadyErr } };

    const beneficiarySocietyId = await resolveBeneficiarySocietyId(
      admin,
      body.eventId,
      body.societyId,
      hostSocietyId,
    );
    const { data: beneficiary } = await admin
      .from("societies")
      .select("id, name, stripe_connect_account_id, stripe_connect_charges_enabled")
      .eq("id", beneficiarySocietyId)
      .maybeSingle();
    if (!beneficiary?.stripe_connect_account_id || !beneficiary.stripe_connect_charges_enabled) {
      return { status: 403, body: { error: "Payment beneficiary Connect account is not ready" } };
    }

    const isJointParticipant = body.societyId !== hostSocietyId;
    const payerType = body.payerType ?? "member";
    let amountPence: number | null = null;
    let memberId: string | null = null;
    let guestId: string | null = null;
    let payerDisplayName = "Member";

    const { data: callerMember } = await admin
      .from("members")
      .select("id, display_name")
      .eq("society_id", body.societyId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!callerMember?.id) return { status: 403, body: { error: "Not a member of this society" } };

    if (payerType === "member") {
      amountPence = resolveMemberCheckoutAmountPence(event, {
        isJointParticipantSociety: isJointParticipant,
      });
      memberId = callerMember.id as string;
      payerDisplayName = String(callerMember.display_name || "Member");
      const { data: reg } = await admin
        .from("event_registrations")
        .select("status, paid, removed_from_event_at")
        .eq("event_id", body.eventId)
        .eq("member_id", memberId)
        .maybeSingle();
      if (reg?.paid) return { status: 409, body: { error: "Already paid" } };
      if (reg?.removed_from_event_at || (reg && reg.status !== "in")) {
        return { status: 400, body: { error: "RSVP as playing before paying" } };
      }
    } else {
      if (!body.guestId) return { status: 400, body: { error: "guestId required" } };
      guestId = body.guestId;
      amountPence = resolveGuestCheckoutAmountPence(event);
      const { data: guest } = await admin
        .from("event_guests")
        .select("id, paid, society_id, event_id, name")
        .eq("id", guestId)
        .maybeSingle();
      if (!guest || guest.event_id !== body.eventId) return { status: 404, body: { error: "Guest not found" } };
      if (guest.society_id !== body.societyId) return { status: 403, body: { error: "Guest belongs to another society" } };
      if (guest.paid) return { status: 409, body: { error: "Already paid" } };
      payerDisplayName = String(guest.name || "Guest");
    }

    if (amountPence == null || amountPence <= 0) {
      return { status: 400, body: { error: "Event fee is not configured for online payment" } };
    }

    const payer = { payerType, memberId, guestId };
    const { data: keyed } = await admin
      .from("payment_transactions")
      .select("id, status, stripe_checkout_session_id, member_id, guest_id, idempotency_key")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (keyed && !checkoutBelongsToPayer(keyed, payer)) {
      return { status: 409, body: { error: "Idempotency key belongs to another payer" } };
    }

    const participantRows = await loadParticipantPayments(
      admin,
      body.eventId,
      payerType,
      (payerType === "member" ? memberId : guestId) as string,
    );
    const attempt = selectParticipantCheckout(keyed ? [keyed as OpenPaymentRow, ...participantRows] : participantRows);
    if (attempt.action === "already_paid") return { status: 409, body: { error: "Already paid" } };

    const stripe = getStripe();
    const urls = buildCheckoutReturnUrls(body.eventId, serverAppBaseUrl(process.env.EXPO_PUBLIC_WEB_APP_URL));
    let transactionId = attempt.action === "reuse" ? attempt.transactionId : "";

    let replacingSession = false;
    if (attempt.action === "reuse" && attempt.sessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(attempt.sessionId);
      if (existingSession.payment_status === "paid") return { status: 409, body: { error: "Already paid" } };
      if (existingSession.status === "open" && existingSession.url) {
        return {
          status: 200,
          body: { url: existingSession.url, sessionId: existingSession.id, transactionId: attempt.transactionId },
        };
      }
      replacingSession = true;
    }

    if (!transactionId) {
      const { data: txRow, error: txErr } = await admin
        .from("payment_transactions")
        .insert({
          society_id: body.societyId,
          beneficiary_society_id: beneficiarySocietyId,
          event_id: body.eventId,
          payer_type: payerType,
          member_id: memberId,
          guest_id: guestId,
          society_name: String(society.name || "Society"),
          beneficiary_society_name: String(beneficiary.name || society.name || "Society"),
          event_name: String(event.name || "Golf event"),
          event_date_snapshot: event.date ? String(event.date) : null,
          payer_display_name: payerDisplayName,
          amount_pence: amountPence,
          currency: "gbp",
          status: "pending",
          payment_method: "stripe",
          idempotency_key: idempotencyKey,
          stripe_connect_account_id: beneficiary.stripe_connect_account_id,
        })
        .select("id")
        .single();
      if (txErr) {
        if (txErr.code === "23505") return { status: 409, body: { error: "A payment is already in progress" } };
        console.error("[checkout] insert tx:", txErr.message);
        return { status: 500, body: { error: "Could not create payment record" } };
      }
      transactionId = txRow.id as string;
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        client_reference_id: transactionId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: amountPence,
              product_data: { name: `Event entry - ${String(event.name || "Golf event")}` },
            },
          },
        ],
        payment_intent_data: {
          transfer_data: { destination: beneficiary.stripe_connect_account_id as string },
        },
        metadata: {
          payment_transaction_id: transactionId,
          event_id: body.eventId,
          society_id: body.societyId,
          beneficiary_society_id: beneficiarySocietyId,
          payer_type: payerType,
          member_id: memberId ?? "",
          guest_id: guestId ?? "",
        },
      },
      { idempotencyKey: replacingSession ? `checkout_${transactionId}_retry` : `checkout_${transactionId}` },
    );

    const { error: sessionSaveErr } = await admin
      .from("payment_transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", transactionId)
      .eq("status", "pending");
    if (sessionSaveErr) {
      console.error("[checkout] save session:", sessionSaveErr.message);
      return { status: 500, body: { error: "Could not store Checkout session" } };
    }
    if (!session.url) return { status: 500, body: { error: "Stripe session missing url" } };

    return { status: 200, body: { url: session.url, sessionId: session.id, transactionId } };
  } catch (err) {
    console.error("[checkout] unexpected:", err);
    return { status: 500, body: { error: "Checkout failed" } };
  }
}

export type { CheckoutRequestBody };
