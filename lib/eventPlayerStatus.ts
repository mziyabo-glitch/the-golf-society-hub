/**
 * Canonical society-scoped player state for event fee / attendance rows.
 *
 * Product rules:
 * - Paid ⇒ treated as confirmed to play (server RPC sets status = in when marking paid).
 * - Tee sheet eligibility = confirmed + paid (see `isTeeSheetEligible` in eventRegistrationRepo).
 * - UI groups: confirmed & paid, pending payment, not playing.
 */

import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  isTeeSheetEligible,
  isRegistrationConfirmed,
} from "@/lib/db_supabase/eventRegistrationRepo";

export type SocietyPlayerBucket = "confirmed_paid" | "pending_payment" | "withdrawn";

/** Single registration row → bucket for society-scoped payment UI. */
export function bucketForRegistration(reg: EventRegistration): SocietyPlayerBucket {
  if (reg.paid) return "confirmed_paid";
  if (reg.status === "out") return "withdrawn";
  return "pending_payment";
}

export function partitionSocietyRegistrations(regs: EventRegistration[]): {
  confirmedPaid: EventRegistration[];
  pendingPayment: EventRegistration[];
  withdrawn: EventRegistration[];
} {
  const confirmedPaid: EventRegistration[] = [];
  const pendingPayment: EventRegistration[] = [];
  const withdrawn: EventRegistration[] = [];
  for (const r of regs) {
    switch (bucketForRegistration(r)) {
      case "confirmed_paid":
        confirmedPaid.push(r);
        break;
      case "pending_payment":
        pendingPayment.push(r);
        break;
      case "withdrawn":
        withdrawn.push(r);
        break;
    }
  }
  return { confirmedPaid, pendingPayment, withdrawn };
}

/** Same rule as tee sheet: status in AND paid (defensive if data drifts). */
export { isTeeSheetEligible as isConfirmedAndPaidForTeeSheet };

/** Member ids with status "in" (used to compute playing-list / lineup gaps). */
export function memberIdsConfirmedIn(regs: EventRegistration[]): Set<string> {
  const s = new Set<string>();
  for (const r of regs) {
    if (isRegistrationConfirmed(r)) s.add(String(r.member_id));
  }
  return s;
}

/**
 * Playing list ids (event.playerIds) in this society that have no "in" registration row yet.
 */
export function lineupMemberIdsPendingFee(opts: {
  playerIds: string[] | undefined;
  societyMemberIds: Set<string>;
  regInMemberIds: Set<string>;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawId of opts.playerIds ?? []) {
    const id = String(rawId);
    if (!id || !opts.societyMemberIds.has(id)) continue;
    if (opts.regInMemberIds.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Status "out" rows, deduped by member_id (latest updated_at), excluding members
 * who appear on the active playing/confirmed list (same logic as legacy event detail).
 */
export function withdrawnRegsForDisplay(
  societyRegs: EventRegistration[],
  activeMemberIds: Set<string>,
  regInMemberIds: Set<string>,
  lineupIds: string[],
): EventRegistration[] {
  const inMainIds = new Set<string>([
    ...[...regInMemberIds],
    ...lineupIds.map(String),
  ]);
  const byMemberId = new Map<string, EventRegistration>();
  for (const reg of societyRegs) {
    if (reg.status !== "out") continue;
    const mid = String(reg.member_id);
    if (!activeMemberIds.has(mid)) continue;
    if (inMainIds.has(mid)) continue;
    const prev = byMemberId.get(mid);
    if (!prev) {
      byMemberId.set(mid, reg);
      continue;
    }
    const prevTs = prev.updated_at ? new Date(prev.updated_at).getTime() : 0;
    const nextTs = reg.updated_at ? new Date(reg.updated_at).getTime() : 0;
    if (nextTs >= prevTs) byMemberId.set(mid, reg);
  }
  return [...byMemberId.values()];
}
