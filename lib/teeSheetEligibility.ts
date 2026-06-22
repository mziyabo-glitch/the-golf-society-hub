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

/** Tee sheet guest ids use `guest-{event_guests.id}` (see tee_group_players.player_id). */
export function guestPlayerId(guestId: string): string {
  return `guest-${String(guestId)}`;
}

export function parseGuestPlayerId(playerId: string): string | null {
  const s = String(playerId);
  if (!s.startsWith("guest-")) return null;
  const gid = s.slice(6).trim();
  return gid.length > 0 ? gid : null;
}

export function isGuestPlayerId(playerId: string): boolean {
  return parseGuestPlayerId(playerId) != null;
}

/** Paid guests count as tee-sheet eligible (no registration row). */
export function isTeeSheetEligibleGuest(g: { paid: boolean }): boolean {
  return g.paid === true;
}

export function teeSheetEligibleGuestPlayerIds(
  guests: { id: string; paid: boolean }[],
): Set<string> {
  return new Set(guests.filter(isTeeSheetEligibleGuest).map((g) => guestPlayerId(g.id)));
}

export type TeeSheetPlayerEligibilityFilter = {
  eligibleMemberIds: Set<string>;
  /** When set, only these `guest-*` player ids are kept (paid guests). */
  eligibleGuestPlayerIds?: Set<string>;
  /** ManCo draft reload: keep every saved row even if eligibility changed since save. */
  preserveAllSavedRows?: boolean;
};

function keepTeeSheetPlayerId(id: string, filter: TeeSheetPlayerEligibilityFilter): boolean {
  if (filter.preserveAllSavedRows) return true;
  const guestId = parseGuestPlayerId(id);
  if (guestId != null) {
    if (filter.eligibleGuestPlayerIds) return filter.eligibleGuestPlayerIds.has(id);
    return true;
  }
  return filter.eligibleMemberIds.has(id);
}

/** Filter member ids to eligible set; guests use paid-only unless preserveAllGuestRows. */
export function filterPlayerIdsForTeeSheet(
  playerIds: string[],
  filter: TeeSheetPlayerEligibilityFilter,
): string[] {
  return playerIds.filter((id) => keepTeeSheetPlayerId(String(id), filter));
}

export function filterTeeGroupPlayersForEligibility<
  T extends { player_id: string; group_number: number; position: number },
>(rows: T[], filter: TeeSheetPlayerEligibilityFilter): T[] {
  return rows.filter((row) => keepTeeSheetPlayerId(String(row.player_id), filter));
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
  filter: TeeSheetPlayerEligibilityFilter,
): T[] {
  return groups
    .map((g) => ({
      ...g,
      players: g.players.filter((p) => keepTeeSheetPlayerId(String(p.id), filter)),
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
  const [teeSheet, regs] = await Promise.all([
    getJointEventTeeSheet(eventId),
    getJointEventRegistrations(eventId),
  ]);
  if (!teeSheet) return null;
  const societies = teeSheet.participating_societies?.map((s) => s.society_id).filter(Boolean) ?? [];
  const { eligibleIds } = jointScopedRegsAndEligibleSet(regs, societies);
  return {
    teeSheet: filterJointTeeSheetByEligible(teeSheet, eligibleIds),
    eligibleIds,
  };
}
