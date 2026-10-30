import type { SocietyPaymentConfig } from "@/lib/payments/eventPricing";

export type CheckoutPayerType = "member" | "guest";

export type CheckoutRequestBody = {
  eventId: string;
  societyId: string;
  payerType?: CheckoutPayerType;
  guestId?: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type CheckoutValidationResult =
  | { ok: true; amountPence: number; beneficiarySocietyId: string }
  | { ok: false; status: number; error: string };

export function parseCheckoutRequestBody(raw: unknown): CheckoutRequestBody | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const eventId = String(o.eventId ?? "").trim();
  const societyId = String(o.societyId ?? "").trim();
  if (!eventId || !societyId) return null;
  const payerType = (o.payerType === "guest" ? "guest" : "member") as CheckoutPayerType;
  return {
    eventId,
    societyId,
    payerType,
    guestId: o.guestId != null ? String(o.guestId).trim() : undefined,
    successUrl: o.successUrl != null ? String(o.successUrl) : undefined,
    cancelUrl: o.cancelUrl != null ? String(o.cancelUrl) : undefined,
  };
}

export function validateSocietyPaymentsReady(society: SocietyPaymentConfig | null | undefined): string | null {
  if (!society?.online_payments_enabled) return "Online payments are not enabled for this society.";
  if (!society.stripe_connect_account_id?.trim()) return "Stripe Connect is not configured.";
  if (!society.stripe_connect_charges_enabled) return "Stripe Connect account cannot accept charges yet.";
  return null;
}

export function assertUuid(id: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
}
