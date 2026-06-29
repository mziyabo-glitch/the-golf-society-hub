/**
 * Joint-event OOM: full-field ranking vs society-scoped OOM point eligibility.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventEntry, JointEventSociety } from "@/lib/db_supabase/jointEventTypes";
import type { EventResultDoc } from "@/lib/db_supabase/resultsRepo";
import {
  dedupeJointMembers,
  memberIdForActiveSocietyInJointDedupe,
  type DedupedJointMember,
} from "@/lib/jointPersonDedupe";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import { isGuestEntrantKey } from "@/lib/oomMemberOnlyScoring";

export type OomFieldEntrant = {
  memberId: string;
  memberName: string;
  dayPoints: string;
  isOomEligible: boolean;
  societyId: string | null;
  mergedResultMemberIds?: string[];
  isKnownMember?: boolean;
};

export function activeSocietyRunsOom(
  participatingSocieties: readonly JointEventSociety[],
  activeSocietyId: string,
): boolean {
  const hit = participatingSocieties.find((s) => s.society_id === activeSocietyId);
  return hit?.has_society_oom !== false;
}

/** Per-entry flag from `event_entry_society_eligibility`; defaults true when row missing. */
export function isJointEntryEligibleForSocietyOom(
  entry: JointEventEntry | undefined,
  activeSocietyId: string,
): boolean {
  if (!entry) return true;
  const row = entry.eligibility?.find((e) => e.society_id === activeSocietyId);
  if (!row) return true;
  return row.is_eligible_for_society_oom !== false;
}

export function resolveMemberOomEligibleForActiveSociety(
  member: MemberDoc | undefined,
  activeSocietyId: string,
  participatingSocieties: readonly JointEventSociety[],
  jointEntryByPlayerId: Map<string, JointEventEntry>,
): boolean {
  if (!member) return false;
  if (!activeSocietyRunsOom(participatingSocieties, activeSocietyId)) return false;
  if (String(member.society_id) !== String(activeSocietyId)) return false;
  const entry = jointEntryByPlayerId.get(member.id);
  return isJointEntryEligibleForSocietyOom(entry, activeSocietyId);
}

function pickJointEntryForCluster(
  cluster: DedupedJointMember,
  jointEntryByPlayerId: Map<string, JointEventEntry>,
): JointEventEntry | undefined {
  for (const mid of cluster.mergedMemberIds) {
    const e = jointEntryByPlayerId.get(mid);
    if (e) return e;
  }
  return undefined;
}

/**
 * One row per real person across all participating societies (+ guests), for full-field NET ranking.
 * `isOomEligible` is true only for active-society members flagged eligible for that society's OOM.
 */
export function buildJointFullFieldOomEntrants(params: {
  mergedCandidateIds: string[];
  allParticipatingMembers: MemberDoc[];
  societyIdToName: Map<string, string>;
  activeSocietyId: string;
  participatingSocieties: readonly JointEventSociety[];
  jointEntries: readonly JointEventEntry[];
  guestById: Map<string, { name?: string | null }>;
}): OomFieldEntrant[] {
  const {
    mergedCandidateIds,
    allParticipatingMembers,
    societyIdToName,
    activeSocietyId,
    participatingSocieties,
    jointEntries,
    guestById,
  } = params;

  const jointEntryByPlayerId = new Map(jointEntries.map((e) => [e.player_id, e]));
  const memberById = new Map(allParticipatingMembers.map((m) => [m.id, m]));
  const deduped = dedupeJointMembers(allParticipatingMembers, societyIdToName);
  const seenPersonKeys = new Set<string>();
  const out: OomFieldEntrant[] = [];

  for (const cluster of deduped) {
    if (seenPersonKeys.has(cluster.key)) continue;
    seenPersonKeys.add(cluster.key);

    const repForActive = memberIdForActiveSocietyInJointDedupe(cluster, allParticipatingMembers, activeSocietyId);
    const repMember = memberById.get(repForActive) ?? cluster.representative;
    const entry = pickJointEntryForCluster(cluster, jointEntryByPlayerId);
    const isOomEligible = resolveMemberOomEligibleForActiveSociety(
      repMember,
      activeSocietyId,
      participatingSocieties,
      jointEntryByPlayerId,
    );

    out.push({
      memberId: repForActive,
      memberName: resolveAttendeeDisplayName(repMember, { memberId: repForActive }).name,
      dayPoints: "",
      isOomEligible,
      societyId: repMember.society_id ?? null,
      mergedResultMemberIds: cluster.mergedMemberIds,
      isKnownMember: true,
    });
  }

  const inList = new Set(out.map((p) => p.memberId));
  for (const pid of mergedCandidateIds) {
    const ps = String(pid);
    if (!ps.startsWith("guest-") || inList.has(ps)) continue;
    const gid = ps.slice("guest-".length);
    const g = guestById.get(gid);
    out.push({
      memberId: ps,
      memberName: String(g?.name ?? "Guest").trim(),
      dayPoints: "",
      isOomEligible: false,
      societyId: null,
      isKnownMember: Boolean(g),
    });
    inList.add(ps);
  }

  return out;
}

/** Merge day_value from any society's persisted results (joint full-field score hydration). */
export function hydrateDayPointsFromCrossSocietyResults(
  entrants: OomFieldEntrant[],
  allEventResults: readonly EventResultDoc[],
  memberById: Map<string, MemberDoc>,
): OomFieldEntrant[] {
  if (allEventResults.length === 0) return entrants;

  const byMemberId = new Map<string, EventResultDoc>();
  const byGuestId = new Map<string, EventResultDoc>();
  for (const r of allEventResults) {
    if (r.member_id) {
      const mid = String(r.member_id);
      const prev = byMemberId.get(mid);
      if (!prev || String(r.updated_at ?? "") > String(prev.updated_at ?? "")) {
        byMemberId.set(mid, r);
      }
    } else if (r.event_guest_id) {
      const gid = String(r.event_guest_id);
      const prev = byGuestId.get(gid);
      if (!prev || String(r.updated_at ?? "") > String(prev.updated_at ?? "")) {
        byGuestId.set(gid, r);
      }
    }
  }

  return entrants.map((p) => {
    if (p.dayPoints.trim() !== "") return p;

    if (isGuestEntrantKey(p.memberId)) {
      const gid = p.memberId.slice("guest-".length);
      const hit = byGuestId.get(gid);
      if (hit?.day_value != null) {
        return { ...p, dayPoints: String(hit.day_value) };
      }
      return p;
    }

    const ids =
      p.mergedResultMemberIds && p.mergedResultMemberIds.length > 0
        ? p.mergedResultMemberIds
        : [p.memberId];
    for (const mid of ids) {
      const hit = byMemberId.get(String(mid));
      if (hit?.day_value != null) {
        return { ...p, dayPoints: String(hit.day_value) };
      }
    }
    return p;
  });
}

export type OomScoringDebugRow = {
  name: string;
  memberId: string;
  societyId: string | null;
  netScore: number | null;
  fieldPosition: number | null;
  isOomEligible: boolean;
  oomPoints: number;
};

export function buildOomScoringDebugRows(
  scored: Array<{
    memberId: string;
    memberName?: string;
    dayPoints: string;
    position: number | null;
    oomPoints: number;
    isOomEligible?: boolean;
    societyId?: string | null;
  }>,
): OomScoringDebugRow[] {
  return scored
    .filter((p) => p.dayPoints.trim() !== "" && !Number.isNaN(parseInt(p.dayPoints.trim(), 10)))
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .map((p) => ({
      name: String(p.memberName ?? p.memberId),
      memberId: p.memberId,
      societyId: p.societyId ?? null,
      netScore: parseInt(p.dayPoints.trim(), 10),
      fieldPosition: p.position,
      isOomEligible: p.isOomEligible ?? !isGuestEntrantKey(p.memberId),
      oomPoints: p.oomPoints,
    }));
}

export function logOomScoringBreakdown(
  label: string,
  rows: OomScoringDebugRow[],
  extra?: Record<string, unknown>,
): void {
  console.log(`[oom-scoring] ${label}`, {
    ...extra,
    entrantCount: rows.length,
    rows,
  });
}
