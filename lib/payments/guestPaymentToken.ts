import { createHash } from "node:crypto";

export function hashGuestPaymentToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isGuestPaymentToken(token: string): boolean {
  return /^[0-9a-f]{64}$/i.test(token.trim());
}

export type GuestInvitationCheck = {
  eventId: string;
  societyId: string;
  guestId: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type GuestCheckoutClaim = {
  eventId: string;
  societyId: string;
  guestId: string;
  amountPence?: number;
};

export function assessGuestCheckoutClaim(input: {
  invitation: GuestInvitationCheck | null;
  claim: GuestCheckoutClaim;
  serverAmountPence: number | null;
  now?: Date;
}): { ok: true; amountPence: number } | { ok: false; status: number; error: string } {
  const invitation = input.invitation;
  if (!invitation) return { ok: false, status: 404, error: "Invitation not found" };
  const now = input.now ?? new Date();
  if (invitation.consumedAt) return { ok: false, status: 409, error: "This invitation has already been used" };
  if (Number.isNaN(Date.parse(invitation.expiresAt)) || Date.parse(invitation.expiresAt) <= now.getTime()) {
    return { ok: false, status: 403, error: "Invitation has expired" };
  }
  if (input.claim.eventId !== invitation.eventId) {
    return { ok: false, status: 403, error: "Invitation is for a different event" };
  }
  if (input.claim.societyId !== invitation.societyId) {
    return { ok: false, status: 403, error: "Invitation is for a different society" };
  }
  if (input.claim.guestId !== invitation.guestId) {
    return { ok: false, status: 403, error: "Invitation is for a different guest" };
  }
  if (input.serverAmountPence == null || input.serverAmountPence <= 0) {
    return { ok: false, status: 400, error: "Event fee is not configured for online payment" };
  }
  if (input.claim.amountPence != null && input.claim.amountPence !== input.serverAmountPence) {
    return { ok: false, status: 400, error: "Amount does not match the event fee" };
  }
  return { ok: true, amountPence: input.serverAmountPence };
}

export function guestInvitationChargeBlock(rows: { status: string }[]): "paid" | "refund_pending" | "used" | null {
  if (rows.some((row) => row.status === "succeeded")) return "paid";
  if (rows.some((row) => row.status === "refund_pending")) return "refund_pending";
  if (rows.some((row) => row.status === "refunded")) return "used";
  return null;
}
