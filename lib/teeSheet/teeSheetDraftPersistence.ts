/**
 * Pure helpers for tee-sheet draft save/reload precedence (unit-tested).
 */

import type { TeeSheetPlayerPolicyRow } from "@/lib/db_supabase/teeGroupsRepo";
import type { EventJointMeta } from "@/lib/db_supabase/jointEventRepo";
import type { CanonicalGroupRow, CanonicalTeeSheetResult } from "@/lib/teeSheet/canonicalTeeSheet";
import { hydratePersistedEditorGroupsWithGuestAssignments, type EditorGuestPlayer } from "@/lib/teeSheet/teeSheetEditorGuests";

export { hydratePersistedEditorGroupsWithGuestAssignments };

export type Gender = "male" | "female" | null;
export type TeeAssignment = "men" | "ladies" | null;

export type EditorGroupRow = {
  groupNumber: number;
  players: EditorGuestPlayer & {
    teeAssignment?: TeeAssignment;
    manualGenderSet?: boolean;
    manualTeeOverride?: TeeAssignment;
    societyLabel?: string | null;
  }[];
};

export function policyByPlayerId(rows: TeeSheetPlayerPolicyRow[]): Map<string, TeeSheetPlayerPolicyRow> {
  return new Map(rows.map((r) => [String(r.player_id), r]));
}

export function teeAssignmentFromGender(
  gender: Gender,
  existing: TeeAssignment | null | undefined,
): TeeAssignment {
  if (gender === "female") return "ladies";
  if (gender === "male") return "men";
  return existing ?? null;
}

/** Prefer persisted DB draft over generated defaults when canonical has tee_groups rows. */
export function shouldLoadPersistedTeeSheetDraft(canonical: CanonicalTeeSheetResult | null): boolean {
  return canonical != null && canonical.source === "tee_groups" && canonical.groups.length > 0;
}

/** True when joint event detail reports 2+ participating societies (RPC truth). */
export function jointMetaFromParticipatingSocieties(
  participatingSocietyIds: readonly string[],
): EventJointMeta {
  const participantSocietyIds = [...new Set(participatingSocietyIds.map(String).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const linkedSocietyCount = participantSocietyIds.length;
  return {
    is_joint_event: linkedSocietyCount >= 2,
    linkedSocietyCount,
    participantSocietyIds,
  };
}

/** Merge event_societies RLS meta with RPC detail when direct count under-reports joint events. */
export function reconcileJointEventMeta(
  eventId: string,
  fromEventSocieties: EventJointMeta,
  participatingSocietyIdsFromRpc: readonly string[] | null | undefined,
): EventJointMeta {
  if (fromEventSocieties.is_joint_event) return fromEventSocieties;
  const rpcMeta = jointMetaFromParticipatingSocieties(participatingSocietyIdsFromRpc ?? []);
  if (!rpcMeta.is_joint_event) return fromEventSocieties;
  if (__DEV__) {
    console.warn("[teesheet] joint meta reconciled from RPC detail", {
      eventId,
      eventSocietiesCount: fromEventSocieties.linkedSocietyCount,
      rpcSocietyCount: rpcMeta.linkedSocietyCount,
    });
  }
  return rpcMeta;
}

export function editorGroupsFromCanonicalRows(
  canonicalGroups: CanonicalGroupRow[],
  opts: {
    memberGenderById?: Map<string, Gender>;
    guestSexByPlayerId?: Map<string, Gender>;
    persistedPolicy?: Map<string, TeeSheetPlayerPolicyRow>;
  } = {},
): EditorGroupRow[] {
  const { memberGenderById, guestSexByPlayerId, persistedPolicy } = opts;

  return canonicalGroups.map((g) => ({
    groupNumber: g.groupNumber,
    players: g.players.map((p) => {
      const persisted = persistedPolicy?.get(String(p.id));
      const manualGender = (persisted?.manual_gender ?? null) as Gender;
      const manualTeeOverride = (persisted?.manual_tee_override ?? null) as TeeAssignment;
      const manualTeeAssignment = (persisted?.manual_tee_assignment ?? null) as TeeAssignment;
      const gender = (manualGender ??
        memberGenderById?.get(p.id) ??
        guestSexByPlayerId?.get(p.id) ??
        null) as Gender;
      const teeAssignment =
        manualTeeOverride ?? manualTeeAssignment ?? teeAssignmentFromGender(gender, null);
      return {
        id: p.id,
        name: p.name,
        handicapIndex: p.handicapIndex ?? null,
        gender,
        teeAssignment,
        manualGenderSet: manualGender != null,
        manualTeeOverride,
        societyLabel: p.societyLabel ?? null,
      };
    }),
  }));
}

export type UpsertTeeSheetWriteCheck = {
  groupsRequested: number;
  playersRequested: number;
  groupsInserted: number;
  playersInserted: number;
};

/** Surface silent RLS failures when inserts return zero rows. */
export function assertTeeSheetUpsertWritten(check: UpsertTeeSheetWriteCheck): void {
  if (check.groupsRequested > 0 && check.groupsInserted === 0) {
    throw new Error("Failed to save tee groups (no rows written — check permissions)");
  }
  if (check.playersRequested > 0 && check.playersInserted === 0) {
    throw new Error("Failed to save tee group players (no rows written — check permissions)");
  }
}
