import { supabase } from "@/lib/supabase";
import * as Crypto from "expo-crypto";

export function checkoutApiBase(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const url = new URL(window.location.origin);
    const host = url.hostname;
    if ((host === "localhost" || host === "127.0.0.1") && url.port === "8081") {
      url.port = "3001";
      return url.origin;
    }
    return window.location.origin;
  }
  return process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || "http://localhost:3001";
}

export async function fetchStagingPlatformChargeEnabled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  try {
    const res = await fetch(`${checkoutApiBase()}/api/stripe/staging-platform-charge`);
    if (!res.ok) return false;
    const body = (await res.json()) as { enabled?: boolean };
    return body.enabled === true;
  } catch {
    return false;
  }
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
