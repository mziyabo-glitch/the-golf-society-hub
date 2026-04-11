/**
 * Society-scoped payment list text for ManCo share actions (WhatsApp-first).
 * Paid = same rule as tee sheet: status "in" AND paid (see isTeeSheetEligible).
 */

import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { isTeeSheetEligible } from "@/lib/db_supabase/eventRegistrationRepo";

export type PaymentShareNameLists = {
  paidNames: string[];
  unpaidNames: string[];
  entries: {
    name: string;
    status: "paid" | "unpaid";
    type: "member" | "guest";
  }[];
};

export function buildPaymentShareNameLists(args: {
  confirmedPaidRegs: EventRegistration[];
  pendingPaymentRegs: EventRegistration[];
  captainPickMemberIds: string[];
  paidGuestNames?: string[];
  unpaidGuestNames?: string[];
  nameForReg: (r: EventRegistration) => string;
  nameForMemberId: (id: string) => string;
}): PaymentShareNameLists {
  const paidMemberRaw = args.confirmedPaidRegs
    .filter(isTeeSheetEligible)
    .map((r) => args.nameForReg(r).trim())
    .filter(Boolean);

  const unpaidMemberRaw = [
    ...args.pendingPaymentRegs.map((r) => args.nameForReg(r).trim()).filter(Boolean),
    ...args.captainPickMemberIds.map((id) => args.nameForMemberId(id).trim()).filter(Boolean),
  ];

  const paidGuestRaw = (args.paidGuestNames ?? []).map((x) => x.trim()).filter(Boolean);
  const unpaidGuestRaw = (args.unpaidGuestNames ?? []).map((x) => x.trim()).filter(Boolean);

  const withGuestSuffix = (name: string, type: "member" | "guest") =>
    type === "guest" ? `${name} (Guest)` : name;

  const uniqSort = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

  const entries = [
    ...paidMemberRaw.map((name) => ({ name, status: "paid" as const, type: "member" as const })),
    ...paidGuestRaw.map((name) => ({ name, status: "paid" as const, type: "guest" as const })),
    ...unpaidMemberRaw.map((name) => ({ name, status: "unpaid" as const, type: "member" as const })),
    ...unpaidGuestRaw.map((name) => ({ name, status: "unpaid" as const, type: "guest" as const })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    paidNames: uniqSort([
      ...paidMemberRaw.map((n) => withGuestSuffix(n, "member")),
      ...paidGuestRaw.map((n) => withGuestSuffix(n, "guest")),
    ]),
    unpaidNames: uniqSort([
      ...unpaidMemberRaw.map((n) => withGuestSuffix(n, "member")),
      ...unpaidGuestRaw.map((n) => withGuestSuffix(n, "guest")),
    ]),
    entries,
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
