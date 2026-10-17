/**
 * Find a member's tee time group from event data.
 * When tee_groups/tee_group_players exist, use findMemberGroupFromTeeSheet.
 * Otherwise uses groupPlayers (regenerated from playerIds).
 *
 * @param memberId - Current member ID
 * @param event - Event with playerIds, teeTimeStart, teeTimeInterval
 * @param members - Society members (id, name, displayName, handicapIndex, gender)
 * @returns Group info or null if member not in event
 */

import { groupPlayers, type GroupedPlayer } from "./teeSheetGrouping";
import { computeTeeTime } from "./computeTeeTime";
import { teeTimeToDisplay } from "./db_supabase/teeGroupsRepo";
import type { MemberDoc } from "./db_supabase/memberRepo";
import { dedupeJointMembers, representativeMemberIdForJoint } from "./jointPersonDedupe";

export type MemberGroupInfo = {
  groupIndex: number;
  groupNumber: number;
  teeTime: string;
  groupMates: string[];
};

const DEFAULT_START = "08:00";
const DEFAULT_INTERVAL = 10;

type MemberLike = {
  id: string;
  name?: string | null;
  displayName?: string | null;
  handicapIndex?: number | null;
  handicap_index?: number | null;
  gender?: "male" | "female" | null;
  /** Home society for this membership row (joint tee sheet / playing-with labels). */
  society_id?: string | null;
  /** After joint dedupe: merged society labels for dual membership. */
  joint_society_label?: string | null;
};

function maybeDedupeMembersForJoint(
  members: MemberLike[],
  societyIdToName?: Map<string, string>,
): MemberLike[] {
  if (!societyIdToName || societyIdToName.size === 0) return members;
  const deduped = dedupeJointMembers(members as MemberDoc[], societyIdToName);
  return deduped.map((d) => ({
    ...d.representative,
    joint_society_label: d.societyLabelMerged,
  })) as MemberLike[];
}

type EventLike = {
  playerIds?: string[] | null;
  teeTimeStart?: string | null;
  teeTimeInterval?: number | null;
};

function formatMateLine(m: MemberLike, societyIdToName?: Map<string, string>): string {
  const name = m.name || m.displayName || "Member";
  const jl = m.joint_society_label?.trim();
  if (jl) return `${name} · ${jl}`;
  const sid = m.society_id;
  if (societyIdToName && sid) {
    const soc = societyIdToName.get(sid) ?? sid;
    return `${name} · ${soc}`;
  }
  return name;
}

export function findMemberGroup(
  memberId: string,
  event: EventLike,
  members: MemberLike[],
  societyIdToName?: Map<string, string>,
): MemberGroupInfo | null {
  if (!memberId || !event) return null;

  const playerIds = event.playerIds ?? [];
  if (playerIds.length === 0) return null;

  const eventMembers = members.filter((m) => playerIds.includes(m.id));
  if (eventMembers.length === 0) return null;

  const memberInEvent = eventMembers.find((m) => m.id === memberId);
  if (!memberInEvent) return null;

  const start = event.teeTimeStart ?? DEFAULT_START;
  const interval =
    Number.isFinite(event.teeTimeInterval) && (event.teeTimeInterval ?? 0) > 0
      ? Number(event.teeTimeInterval)
      : DEFAULT_INTERVAL;

  const grouped = eventMembers.map((m) => ({
    id: m.id,
    name: m.name || m.displayName || "Member",
    handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
    courseHandicap: null as number | null,
    playingHandicap: null as number | null,
  })) as GroupedPlayer[];

  const groups = groupPlayers(grouped, true);
  if (groups.length === 0) return null;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const found = group.players.some((p) => p.id === memberId);
    if (found) {
      const groupMates = group.players
        .filter((p) => p.id !== memberId)
        .map((p) => {
          const mate = eventMembers.find((em) => em.id === p.id);
          return mate
            ? formatMateLine(mate, societyIdToName)
            : p.name;
        })
        .filter(Boolean);

      const teeTime = computeTeeTime(start, interval, i);

      return {
        groupIndex: i,
        groupNumber: group.groupNumber,
        teeTime,
        groupMates,
      };
    }
  }

  return null;
}

type TeeGroupRow = { group_number: number; tee_time: string | null };
type TeeGroupPlayerRow = { player_id: string; group_number: number; position: number };

/**
 * Find a member's tee time from persisted tee_groups and tee_group_players.
 * Use when tee sheet has been saved to DB.
 */
export function findMemberGroupFromTeeSheet(
  memberId: string,
  teeGroups: TeeGroupRow[],
  teeGroupPlayers: TeeGroupPlayerRow[],
  members: MemberLike[],
  societyIdToName?: Map<string, string>,
): MemberGroupInfo | null {
  if (!memberId || !teeGroups?.length || !teeGroupPlayers?.length) return null;

  const repId =
    societyIdToName && societyIdToName.size > 0
      ? representativeMemberIdForJoint(memberId, members as MemberDoc[], societyIdToName)
      : memberId;

  let assignment = teeGroupPlayers.find((p) => p.player_id === memberId);
  if (!assignment && repId !== memberId) {
    assignment = teeGroupPlayers.find((p) => p.player_id === repId);
  }
  if (!assignment) return null;

  const grp = teeGroups.find((g) => g.group_number === assignment.group_number);
  const teeTime = grp?.tee_time ? teeTimeToDisplay(grp.tee_time) : "08:00";

  const mateSlots = teeGroupPlayers
    .filter(
      (p) =>
        p.group_number === assignment.group_number &&
        p.player_id !== memberId &&
        p.player_id !== repId,
    )
    .sort((a, b) => a.position - b.position);

  const seenRep = new Set<string>();
  const groupMates: string[] = [];
  const map =
    societyIdToName && societyIdToName.size > 0 ? societyIdToName : new Map<string, string>();

  for (const p of mateSlots) {
    const mateRep =
      map.size > 0
        ? representativeMemberIdForJoint(p.player_id, members as MemberDoc[], map)
        : p.player_id;
    if (seenRep.has(mateRep)) continue;
    seenRep.add(mateRep);

    const rawMate = members.find((m) => m.id === mateRep) ?? members.find((m) => m.id === p.player_id);
    if (!rawMate) continue;
    const [deduped] = maybeDedupeMembersForJoint([rawMate], societyIdToName);
    groupMates.push(formatMateLine(deduped ?? rawMate, societyIdToName));
  }

  return {
    groupIndex: assignment.group_number - 1,
    groupNumber: assignment.group_number,
    teeTime,
    groupMates,
  };
}
