/**
 * Tee sheet generation uses one rule: confirmed + paid (see `isTeeSheetEligible`).
 * Admin attendance UI may still show broader states (confirmed unpaid, playing list, etc.).
 *
 * Event detail (society tab) uses `filterRegistrationsForActiveSocietyMembers` + `partitionSocietyRegistrations`
 * (eventRegistrationRepo / eventPlayerStatus) — broader than tee-sheet eligibility.
 */

import { getJointEventTeeSheet } from "@/lib/db_supabase/jointEventRepo";
import type { JointEventTeeSheet, JointEventTeeSheetEntry, JointEventTeeSheetGroup } from "@/lib/db_supabase/jointEventTypes";
import {
  getEventRegistrations,
  isTeeSheetEligible,
  scopeEventRegistrations,
  type EventRegistration,
} from "@/lib/db_supabase/eventRegistrationRepo";

export function eligibleMemberIdSetFromRegistrations(regs: EventRegistration[]): Set<string> {
  return new Set(regs.filter(isTeeSheetEligible).map((r) => String(r.member_id)));
}

/** Keep guest-* ids; filter member ids to the eligible set. */
export function filterPlayerIdsForTeeSheet(playerIds: string[], eligible: Set<string>): string[] {
  return playerIds.filter((id) => {
    const s = String(id);
    if (s.startsWith("guest-")) return true;
    return eligible.has(s);
  });
}

export function filterTeeGroupPlayersForEligibility<
  T extends { player_id: string; group_number: number; position: number },
>(rows: T[], eligible: Set<string>): T[] {
  return rows.filter((row) => {
    const id = String(row.player_id);
    if (id.startsWith("guest-")) return true;
    return eligible.has(id);
  });
}

/**
 * Joint ManCo tee sheet read model: drop entries whose society-scoped registration is not paid+confirmed.
 */
export function filterJointTeeSheetByEligible(
  teeSheet: JointEventTeeSheet,
  eligibleMemberIds: Set<string>,
): JointEventTeeSheet {
  const keep = (e: JointEventTeeSheetEntry) => eligibleMemberIds.has(String(e.player_id));

  const groups: JointEventTeeSheetGroup[] = (teeSheet.groups ?? []).map((g) => ({
    ...g,
    entries: (g.entries ?? []).filter(keep),
  }));
  const entries = (teeSheet.entries ?? []).filter(keep);
  return { ...teeSheet, groups, entries };
}

/** Scope + eligible set for a joint event (participant societies only). */
export function jointScopedRegsAndEligibleSet(
  allRegs: EventRegistration[],
  participantSocietyIds: string[],
): { scoped: EventRegistration[]; eligibleIds: Set<string> } {
  const scoped = scopeEventRegistrations(allRegs, {
    kind: "joint_participants",
    participantSocietyIds,
  });
  return { scoped, eligibleIds: eligibleMemberIdSetFromRegistrations(scoped) };
}

/** Fresh eligibility for save/publish (avoids stale UI state). */
export async function fetchEligibleMemberIdsForTeeSheetSave(opts: {
  eventId: string;
  isJoint: boolean;
  participantSocietyIds: string[];
  hostSocietyId: string | null;
}): Promise<Set<string>> {
  const regs = await getEventRegistrations(opts.eventId);
  if (opts.isJoint && opts.participantSocietyIds.length > 0) {
    return jointScopedRegsAndEligibleSet(regs, opts.participantSocietyIds).eligibleIds;
  }
  const scoped = scopeEventRegistrations(regs, { kind: "standard", hostSocietyId: opts.hostSocietyId });
  return eligibleMemberIdSetFromRegistrations(scoped);
}

export function sanitizePlayerGroupsForTeeSheetSave<T extends { players: { id: string }[] }>(
  groups: T[],
  eligible: Set<string>,
): T[] {
  return groups
    .map((g) => ({
      ...g,
      players: g.players.filter((p) => {
        const id = String(p.id);
        if (id.startsWith("guest-")) return true;
        return eligible.has(id);
      }),
    }))
    .filter((g) => g.players.length > 0);
}

/**
 * Joint tee sheet with **eligibility filter** (confirmed + paid per scoped registrations).
 * Prefer **`getJointEventTeeSheet`** for member-facing / canonical display — published pairings must not
 * be dropped when registration visibility differs by society (RLS). This helper remains for analytics
 * or strict “paid-only” previews if needed.
 */
export async function loadJointTeeSheetForManCo(eventId: string): Promise<{
  teeSheet: JointEventTeeSheet;
  eligibleIds: Set<string>;
} | null> {
  const [teeSheet, regs] = await Promise.all([getJointEventTeeSheet(eventId), getEventRegistrations(eventId)]);
  if (!teeSheet) return null;
  const societies = teeSheet.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
  const { eligibleIds } = jointScopedRegsAndEligibleSet(regs, societies);
  return {
    teeSheet: filterJointTeeSheetByEligible(teeSheet, eligibleIds),
    eligibleIds,
  };
}
