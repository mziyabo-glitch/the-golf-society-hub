/**
 * Joint events: deduplicate society membership rows that represent the same real person
 * (e.g. same user in two participating societies). Never merge by display name alone.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { GroupedPlayer } from "@/lib/teeSheetGrouping";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";

/** Stable key for grouping; two rows with the same key are treated as one person. */
export function canonicalJointPersonKey(member: MemberDoc | null | undefined): string {
  if (!member) return "unknown";

  const uid = member.user_id?.trim();
  if (uid) return `uid:${uid}`;

  const personId = (member as { person_id?: string | null }).person_id?.trim?.();
  if (personId) return `pid:${personId}`;

  const em = member.email?.trim().toLowerCase();
  if (em && em.includes("@")) return `email:${em}`;

  return `mid:${member.id}`;
}

function pickRepresentative(members: MemberDoc[]): MemberDoc {
  if (members.length === 1) return members[0];
  const withUser = members.filter((m) => m.user_id?.trim());
  if (withUser.length > 0) {
    withUser.sort((a, b) => a.id.localeCompare(b.id));
    return withUser[0];
  }
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  return sorted[0];
}

export type DedupedJointMember = {
  key: string;
  representative: MemberDoc;
  /** All member row ids merged into this person (for eligibility / debugging). */
  mergedMemberIds: string[];
  /** Merged society display names, e.g. "Society A & Society B". */
  societyLabelMerged: string;
};

/**
 * Build merged society label from member rows (unique by society_id).
 */
export function mergeJointSocietyLabels(
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
): string {
  const labels = new Set<string>();
  for (const m of members) {
    if (!m.society_id) continue;
    const label = societyIdToName.get(m.society_id) ?? m.society_id;
    labels.add(label);
  }
  const arr = [...labels].sort((a, b) => a.localeCompare(b));
  if (arr.length <= 1) return arr[0] ?? "";
  return arr.join(" & ");
}

/**
 * Deduplicate members for joint UI (one row per real person).
 */
export function dedupeJointMembers(
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
): DedupedJointMember[] {
  const byKey = new Map<string, MemberDoc[]>();
  for (const m of members) {
    const k = canonicalJointPersonKey(m);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(m);
  }

  const out: DedupedJointMember[] = [];
  for (const [key, group] of byKey) {
    const representative = pickRepresentative(group);
    const mergedMemberIds = group.map((m) => m.id).sort((a, b) => a.localeCompare(b));
    const societyLabelMerged = mergeJointSocietyLabels(group, societyIdToName);
    out.push({ key, representative, mergedMemberIds, societyLabelMerged });
  }
  out.sort((a, b) =>
    (a.representative.name || a.representative.display_name || "").localeCompare(
      b.representative.name || b.representative.display_name || "",
    ),
  );
  return out;
}

/**
 * Map any member id (including a non-representative duplicate) → representative id for joint selection/save.
 */
export function representativeMemberIdForJoint(
  memberId: string,
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
): string {
  const m = members.find((x) => x.id === memberId);
  if (!m) return memberId;
  const deduped = dedupeJointMembers(members, societyIdToName);
  const k = canonicalJointPersonKey(m);
  const hit = deduped.find((d) => d.key === k);
  return hit?.representative.id ?? memberId;
}

/**
 * Normalize a set of selected member ids to representative ids only (joint).
 */
export function normalizeJointSelectedMemberIds(
  ids: Iterable<string>,
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    out.add(representativeMemberIdForJoint(id, members, societyIdToName));
  }
  return out;
}

/**
 * For joint `event_entries` sync: one DB row per **society member id** that participates.
 * Selection UI stores one **representative** id per real person; that id may be the host
 * society's row while the same person also has a row in another participating society.
 * Without expansion, Points (society-scoped) never sees the other society's `player_id`.
 */
/**
 * Joint ManCo tee save/publish: each `event_entries` row must use a **society-specific** `player_id`
 * when a person has multiple `members` rows. Duplicate pairing_group/position for each expanded id;
 * tee-sheet read merges clusters for display.
 */
export function expandJointTeeSheetReplaceRowsForParticipatingSocieties<
  T extends { player_id: string; pairing_group: number | null; pairing_position: number | null },
>(
  rows: T[],
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
  participatingSocietyIds: string[],
): T[] {
  const societySet = new Set(participatingSocietyIds.filter(Boolean));
  if (rows.length === 0 || societySet.size === 0) return rows;

  const deduped = dedupeJointMembers(members, societyIdToName);
  const out: T[] = [];

  for (const row of rows) {
    const m = members.find((x) => x.id === row.player_id);
    if (!m) {
      out.push(row);
      continue;
    }
    const k = canonicalJointPersonKey(m);
    const cluster = deduped.find((d) => d.key === k);
    if (!cluster) {
      out.push(row);
      continue;
    }
    const expandedIds = cluster.mergedMemberIds.filter((mid) => {
      const mem = members.find((x) => x.id === mid);
      return mem && societySet.has(mem.society_id);
    });
    if (
      __DEV__ &&
      societySet.size >= 2 &&
      cluster.mergedMemberIds.length >= 2 &&
      expandedIds.length === 1
    ) {
      console.warn(
        "[joint-tee-expand] merged joint person has multiple member rows but only one resolved in the tee-sheet member pool; replace_joint_event_tee_sheet_entries may omit a society-specific player_id",
        { basePlayerId: row.player_id, mergedMemberIds: cluster.mergedMemberIds },
      );
    }
    if (expandedIds.length <= 1) {
      out.push(row);
      continue;
    }
    for (const mid of expandedIds) {
      out.push({ ...row, player_id: mid });
    }
  }
  return out;
}

export function expandJointRepresentativesToParticipatingMemberIds(
  selectedRepresentativeIds: string[],
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
  participatingSocietyIds: string[],
): string[] {
  const societySet = new Set(participatingSocietyIds.filter(Boolean));
  const selected = new Set(selectedRepresentativeIds.map(String).filter(Boolean));
  if (selected.size === 0 || societySet.size === 0) {
    return [...selected].sort((a, b) => a.localeCompare(b));
  }

  const deduped = dedupeJointMembers(members, societyIdToName);
  const out = new Set<string>();

  for (const d of deduped) {
    const repSelected = selected.has(d.representative.id);
    const anyMergedSelected = d.mergedMemberIds.some((id) => selected.has(id));
    if (!repSelected && !anyMergedSelected) continue;

    for (const mid of d.mergedMemberIds) {
      const m = members.find((x) => x.id === mid);
      if (m?.society_id && societySet.has(m.society_id)) {
        out.add(mid);
      }
    }
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}

export type JointAttendingDisplayRow = {
  key: string;
  primary: string;
  societyLine: string;
  sourceNote?: string;
};

type AttendingItem = {
  memberId: string;
  primary: string;
  sourceNote?: string;
  /** Lower = higher priority for choosing display name */
  priority: number;
};

/**
 * Merge attendance list items that refer to the same person (joint only).
 */
/**
 * Tee sheet / scoring: collapse duplicate society rows for the same person while preserving order.
 */
export function dedupeJointGroupedPlayers(
  playersInOrder: GroupedPlayer[],
  members: MemberDoc[],
  societyIdToName: Map<string, string>,
): GroupedPlayer[] {
  if (!societyIdToName.size) return playersInOrder;

  const seenRep = new Set<string>();
  const out: GroupedPlayer[] = [];

  for (const p of playersInOrder) {
    const m = members.find((x) => x.id === p.id);
    if (!m) {
      out.push(p);
      continue;
    }
    const rep = representativeMemberIdForJoint(m.id, members, societyIdToName);
    if (seenRep.has(rep)) continue;
    seenRep.add(rep);

    const key = canonicalJointPersonKey(m);
    const cluster = members.filter((x) => canonicalJointPersonKey(x) === key);
    const dList = dedupeJointMembers(cluster, societyIdToName);
    const d = dList.find((r) => r.representative.id === rep) ?? dList[0];
    if (!d) {
      out.push(p);
      continue;
    }

    out.push({
      id: d.representative.id,
      name: resolveAttendeeDisplayName(d.representative, { memberId: d.representative.id }).name,
      handicapIndex: d.representative.handicapIndex ?? d.representative.handicap_index ?? null,
      courseHandicap: p.courseHandicap ?? null,
      playingHandicap: p.playingHandicap ?? null,
      societyLabel: d.societyLabelMerged,
    });
  }

  return out;
}

export function mergeJointAttendingDisplayRows(
  items: AttendingItem[],
  getMember: (memberId: string) => MemberDoc | undefined,
  societyIdToName: Map<string, string>,
): JointAttendingDisplayRow[] {
  type Bucket = { items: AttendingItem[]; members: MemberDoc[] };
  const byKey = new Map<string, Bucket>();

  for (const it of items) {
    const m = getMember(it.memberId);
    const stub: MemberDoc = m ?? {
      id: it.memberId,
      society_id: "",
    };
    const k = canonicalJointPersonKey(stub);
    if (!byKey.has(k)) byKey.set(k, { items: [], members: [] });
    const b = byKey.get(k)!;
    b.items.push(it);
    if (m && !b.members.some((x) => x.id === m.id)) b.members.push(m);
  }

  const rows: JointAttendingDisplayRow[] = [];
  for (const [key, bucket] of byKey) {
    bucket.items.sort((a, b) => a.priority - b.priority || a.memberId.localeCompare(b.memberId));
    const primary = bucket.items[0]?.primary?.trim() || "Unknown";
    const societyLine =
      bucket.members.length > 0
        ? mergeJointSocietyLabels(bucket.members, societyIdToName)
        : "Society unknown";
    const sources = [...new Set(bucket.items.map((i) => i.sourceNote).filter(Boolean) as string[])];
    const sourceNote = sources.length > 0 ? sources.join(" · ") : undefined;
    rows.push({ key, primary, societyLine, sourceNote });
  }
  rows.sort((a, b) => a.primary.localeCompare(b.primary));
  return rows;
}
