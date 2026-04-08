/**
 * Society-scoped payment list text for ManCo share actions (WhatsApp-first).
 * Paid = same rule as tee sheet: status "in" AND paid (see isTeeSheetEligible).
 */

import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { isTeeSheetEligible } from "@/lib/db_supabase/eventRegistrationRepo";

export type PaymentShareNameLists = {
  paidNames: string[];
  unpaidNames: string[];
};

export function buildPaymentShareNameLists(args: {
  confirmedPaidRegs: EventRegistration[];
  pendingPaymentRegs: EventRegistration[];
  captainPickMemberIds: string[];
  nameForReg: (r: EventRegistration) => string;
  nameForMemberId: (id: string) => string;
}): PaymentShareNameLists {
  const paidRaw = args.confirmedPaidRegs
    .filter(isTeeSheetEligible)
    .map((r) => args.nameForReg(r).trim())
    .filter(Boolean);

  const unpaidRaw = [
    ...args.pendingPaymentRegs.map((r) => args.nameForReg(r).trim()).filter(Boolean),
    ...args.captainPickMemberIds.map((id) => args.nameForMemberId(id).trim()).filter(Boolean),
  ];

  const uniqSort = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

  return {
    paidNames: uniqSort(paidRaw),
    unpaidNames: uniqSort(unpaidRaw),
  };
}

export function formatSharePaymentHeader(opts: {
  eventName: string;
  dateShort: string;
  jointThisSocietyOnly: boolean;
}): string {
  let h = opts.eventName.trim() || "Event";
  if (opts.dateShort.trim()) h += ` · ${opts.dateShort.trim()}`;
  if (opts.jointThisSocietyOnly) h += " · this society only";
  return h;
}

export function formatWhatsAppPaidList(header: string, names: string[]): string {
  if (names.length === 0) return `${header}\n\nPaid: none`;
  return `${header}\n\nPaid (${names.length}): ${names.join(", ")}`;
}

export function formatWhatsAppUnpaidList(header: string, names: string[]): string {
  if (names.length === 0) return `${header}\n\nUnpaid: none`;
  return `${header}\n\nUnpaid (${names.length}): ${names.join(", ")}`;
}

export function formatWhatsAppFullPaymentStatus(header: string, paid: string[], unpaid: string[]): string {
  const p = paid.length ? paid.join(", ") : "—";
  const u = unpaid.length ? unpaid.join(", ") : "—";
  return `${header}\n\nPaid (${paid.length}):\n${p}\n\nUnpaid (${unpaid.length}):\n${u}`;
}
