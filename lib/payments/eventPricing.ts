import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { hasBillableEventFee } from "@/lib/home/homeNextEventPanelModel";

export type SocietyPaymentConfig = {
  online_payments_enabled?: boolean | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_charges_enabled?: boolean | null;
  event_bank_transfer_instructions?: string | null;
};

export type EventFeePence = {
  memberPence: number | null;
  guestPence: number | null;
  jointParticipantPence: number | null;
};

export function readEventFeePence(event: EventDoc | Record<string, unknown>): EventFeePence {
  const row = event as Record<string, unknown>;
  const num = (k: string) => {
    const v = row[k] ?? row[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
  };
  return {
    memberPence: num("member_entry_fee_pence"),
    guestPence: num("guest_entry_fee_pence"),
    jointParticipantPence: num("joint_participant_entry_fee_pence"),
  };
}

/** Member Checkout amount: structured pence first, else null (display-only fee). */
export function resolveMemberCheckoutAmountPence(
  event: EventDoc | Record<string, unknown>,
  opts?: { isJointParticipantSociety?: boolean },
): number | null {
  const fees = readEventFeePence(event);
  if (opts?.isJointParticipantSociety && fees.jointParticipantPence != null && fees.jointParticipantPence > 0) {
    return fees.jointParticipantPence;
  }
  if (fees.memberPence != null && fees.memberPence > 0) return fees.memberPence;
  return null;
}

export function resolveGuestCheckoutAmountPence(event: EventDoc | Record<string, unknown>): number | null {
  const fees = readEventFeePence(event);
  if (fees.guestPence != null && fees.guestPence > 0) return fees.guestPence;
  return null;
}

export function shouldShowOnlinePayNow(input: {
  society: SocietyPaymentConfig | null | undefined;
  event: EventDoc | Record<string, unknown>;
  amountPence: number | null;
  alreadyPaid: boolean;
  playing: boolean;
  /** Local staging only. Does not replace the playing, unpaid, or fee checks. */
  stagingPlatformCharge?: boolean;
}): boolean {
  if (!input.playing || input.alreadyPaid) return false;
  if (!input.society?.online_payments_enabled) return false;
  if (input.amountPence == null || input.amountPence <= 0) return false;
  if (input.stagingPlatformCharge === true) return true;
  if (!input.society.stripe_connect_charges_enabled || !input.society.stripe_connect_account_id?.trim()) {
    return false;
  }
  return true;
}

/** UI: show payment row when billable by pence or legacy display string. */
export function shouldShowEventPaymentRow(input: {
  playing: boolean;
  paid: boolean;
  entryFeeDisplay?: string | null;
  memberFeePence?: number | null;
}): boolean {
  if (!input.playing) return false;
  if (input.memberFeePence != null && input.memberFeePence > 0) return true;
  return hasBillableEventFee(input.entryFeeDisplay);
}

export function formatPenceGbpShort(pence: number): string {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}
