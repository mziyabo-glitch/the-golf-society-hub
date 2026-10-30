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

    const { data: existingTx } = await admin
      .from("payment_transactions")
      .select("id, stripe_checkout_session_id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingTx?.stripe_checkout_session_id && existingTx.status === "pending") {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(existingTx.stripe_checkout_session_id);
      if (session.url) {
        return {
          status: 200,
          body: {
            url: session.url,
            sessionId: session.id,
            transactionId: existingTx.id as string,
          },
        };
      }
    }

    const { data: event, error: eventErr } = await admin
      .from("events")
      .select(
        "id, society_id, name, member_entry_fee_pence, guest_entry_fee_pence, joint_participant_entry_fee_pence",
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
      .select("stripe_connect_account_id, stripe_connect_charges_enabled")
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

    if (payerType === "member") {
      amountPence = resolveMemberCheckoutAmountPence(event, {
        isJointParticipantSociety: isJointParticipant,
      });
      const { data: member } = await admin
        .from("members")
        .select("id")
        .eq("society_id", body.societyId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!member?.id) return { status: 403, body: { error: "Not a member of this society" } };
      memberId = member.id as string;

      const { data: reg } = await admin
        .from("event_registrations")
        .select("status, paid")
        .eq("event_id", body.eventId)
        .eq("member_id", memberId)
        .maybeSingle();
      if (reg?.paid) return { status: 409, body: { error: "Already paid" } };
      if (reg && reg.status !== "in") {
        return { status: 400, body: { error: "RSVP as playing before paying" } };
      }
    } else {
      if (!body.guestId) return { status: 400, body: { error: "guestId required" } };
      guestId = body.guestId;
      amountPence = resolveGuestCheckoutAmountPence(event);
      const { data: guest } = await admin
        .from("event_guests")
        .select("id, paid, society_id, event_id")
        .eq("id", guestId)
        .maybeSingle();
      if (!guest || guest.event_id !== body.eventId) return { status: 404, body: { error: "Guest not found" } };
      if (guest.society_id !== body.societyId) return { status: 403, body: { error: "Guest belongs to another society" } };
      if (guest.paid) return { status: 409, body: { error: "Already paid" } };
    }

    if (amountPence == null || amountPence <= 0) {
      return { status: 400, body: { error: "Event fee is not configured for online payment" } };
    }

    const { data: txRow, error: txErr } = await admin
      .from("payment_transactions")
      .insert({
        society_id: body.societyId,
        beneficiary_society_id: beneficiarySocietyId,
        event_id: body.eventId,
        payer_type: payerType,
        member_id: memberId,
        guest_id: guestId,
        amount_pence: amountPence,
        currency: "gbp",
        status: "pending",
        payment_method: "stripe",
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();

    if (txErr) {
      if (txErr.code === "23505") {
        return { status: 409, body: { error: "Duplicate idempotency key" } };
      }
      console.error("[checkout] insert tx:", txErr.message);
      return { status: 500, body: { error: "Could not create payment record" } };
    }

    const transactionId = txRow.id as string;
    const stripe = getStripe();
    const baseUrl =
      body.successUrl?.trim() ||
      process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() ||
      "http://localhost:8081";
    const successUrl = `${baseUrl.replace(/\/$/, "")}/event/${body.eventId}?payment=success`;
    const cancelUrl =
      body.cancelUrl?.trim() || `${baseUrl.replace(/\/$/, "")}/event/${body.eventId}?payment=canceled`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: amountPence,
              product_data: {
                name: `Event entry — ${(event.name as string) || "Golf event"}`,
              },
            },
          },
        ],
        payment_intent_data: {
          transfer_data: {
            destination: beneficiary.stripe_connect_account_id as string,
          },
        },
        metadata: {
          payment_transaction_id: transactionId,
          event_id: body.eventId,
          society_id: body.societyId,
          payer_type: payerType,
          member_id: memberId ?? "",
          guest_id: guestId ?? "",
        },
      },
      { idempotencyKey: `checkout_${idempotencyKey}` },
    );

    await admin
      .from("payment_transactions")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", transactionId);

    if (!session.url) return { status: 500, body: { error: "Stripe session missing url" } };

    return {
      status: 200,
      body: { url: session.url, sessionId: session.id, transactionId },
    };
  } catch (err) {
    console.error("[checkout] unexpected:", err);
    return { status: 500, body: { error: "Checkout failed" } };
  }
}

export type { CheckoutRequestBody };
