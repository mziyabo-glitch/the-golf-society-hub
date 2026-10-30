import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";

function checkoutApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || "http://localhost:3001";
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sign in to pay online.");
  }
  return data.session.access_token;
}

export async function startMemberEventCheckout(opts: {
  eventId: string;
  societyId: string;
}): Promise<{ url: string }> {
  const token = await getAccessToken();
  const idempotencyKey = Crypto.randomUUID();
  const res = await fetch(`${checkoutApiBase()}/api/stripe/create-checkout-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      eventId: opts.eventId,
      societyId: opts.societyId,
      payerType: "member",
    }),
  });
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) throw new Error(body.error || "Could not start checkout");
  if (!body.url) throw new Error("Checkout URL missing");
  return { url: body.url };
}

export async function startGuestInvitationCheckout(opts: {
  paymentToken: string;
  eventId: string;
  societyId: string;
  guestId: string;
  amountPence: number;
}): Promise<{ url: string }> {
  const idempotencyKey = Crypto.randomUUID();
  const res = await fetch(`${checkoutApiBase()}/api/stripe/guest-checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      paymentToken: opts.paymentToken,
      eventId: opts.eventId,
      societyId: opts.societyId,
      guestId: opts.guestId,
      amountPence: opts.amountPence,
    }),
  });
  const body = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) throw new Error(body.error || "Could not start checkout");
  if (!body.url) throw new Error("Checkout URL missing");
  return { url: body.url };
}
