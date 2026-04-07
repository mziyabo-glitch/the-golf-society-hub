/**
 * Single source of truth for published tee sheet data (groups, order, tee times).
 *
 * HARD RULE:
 * For joint events, tee sheets are event-scoped. Do not filter by society.
 * Always render the published canonical tee sheet from event_entries.
 *
 * - **Joint events:** `getJointEventTeeSheet` (saved pairings, **not** eligibility-filtered — published groups are source of truth).
 * - **Standard events:** `tee_groups` + `tee_group_players` when present (saved snapshot).
 * - **Fallback:** Only when published but no DB snapshot — recompute from `playerIds` / eligible regs
 *   using the same `groupPlayers` + `assignTeeTimes` as legacy (last resort).
 */

import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getJointEventDetail, getJointEventTeeSheet, getJointMetaForEventIds, mapJointEventToEventDoc } from "@/lib/db_supabase/jointEventRepo";
import type { JointEventTeeSheet } from "@/lib/db_supabase/jointEventTypes";
import {
  getTeeGroups,
  getTeeGroupPlayers,
  teeTimeToDisplay,
  type TeeGroupRow,
  type TeeGroupPlayerRow,
} from "@/lib/db_supabase/teeGroupsRepo";
import {
  getEventRegistrations,
  isTeeSheetEligible,
  scopeEventRegistrations,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import { getMembersBySocietyId, getMembersByIds, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { resolveAttendeeDisplayName } from "@/lib/eventAttendeeName";
import { societyLabelFromMember } from "@/lib/jointEventSocietyLabel";
import { dedupeJointGroupedPlayers, representativeMemberIdForJoint } from "@/lib/jointPersonDedupe";
import { eligibleMemberIdSetFromRegistrations, filterTeeGroupPlayersForEligibility } from "@/lib/teeSheetEligibility";
import { assignTeeTimes, groupPlayers, type GroupedPlayer } from "@/lib/teeSheetGrouping";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import type { ManCoDetails } from "@/lib/db_supabase/memberRepo";
import type { MemberGroupInfo } from "@/lib/findMemberGroup";

const DEFAULT_START = "08:00";
const DEFAULT_INTERVAL = 10;

export type CanonicalTeeSheetSource = "joint_entries" | "tee_groups" | "computed_fallback";

export type CanonicalPlayerRow = {
  id: string;
  name: string;
  handicapIndex: number | null;
  societyLabel?: string;
};

export type CanonicalGroupRow = {
  groupNumber: number;
  teeTime: string;
  players: CanonicalPlayerRow[];
};

export type CanonicalTeeSheetResult = {
  eventId: string;
  source: CanonicalTeeSheetSource;
  isJoint: boolean;
  published: boolean;
  event: EventDoc;
  jointParticipatingSocieties?: { society_id: string; society_name?: string | null }[];
  groups: CanonicalGroupRow[];
};

function logCanonicalDebug(label: string, payload: Record<string, unknown>) {
  if (__DEV__) {
    console.log(`[teesheet][canonical] ${label}`, payload);
  }
}

function logTeeSheetLoadSource(
  eventId: string,
  source: CanonicalTeeSheetSource,
  groups: CanonicalGroupRow[],
  jointParticipatingSocieties?: { society_id: string; society_name?: string | null }[],
) {
  if (!__DEV__) return;
  const playerIds = [...new Set(groups.flatMap((g) => g.players.map((p) => p.id)))];
  const societies = societiesRepresentedInCanonical(groups, jointParticipatingSocieties);
  console.log("[teesheet] load source", {
    eventId,
    source: "canonical",
    canonicalSource: source,
    societies,
    playerIds,
  });
}

/** All member ids referenced by joint tee sheet groups (before canonical mapping). */
function collectJointSourceMemberIds(ts: JointEventTeeSheet): string[] {
  const out: string[] = [];
  for (const g of ts.groups ?? []) {
    for (const e of g.entries ?? []) {
      if (e.player_id) out.push(String(e.player_id));
    }
  }
  return [...new Set(out)];
}

function collectCanonicalMemberIds(groups: CanonicalGroupRow[]): string[] {
  return [...new Set(groups.flatMap((g) => g.players.map((p) => p.id)))];
}

function societiesRepresentedInCanonical(
  groups: CanonicalGroupRow[],
  jointParticipating?: { society_id: string; society_name?: string | null }[],
): string[] {
  const labels = new Set<string>();
  for (const g of groups) {
    for (const p of g.players) {
      if (p.societyLabel?.trim()) labels.add(p.societyLabel.trim());
    }
  }
  const fromJoint = (jointParticipating ?? []).map((s) => s.society_name?.trim() || s.society_id).filter(Boolean);
  for (const s of fromJoint) labels.add(s);
  return [...labels];
}

/** DEV: one place for joint canonical pipeline logs (source → final). */
function logDevJointCanonicalPipeline(eventId: string, teeSheet: JointEventTeeSheet, canonicalGroups: CanonicalGroupRow[]) {
  if (!__DEV__) return;
  const sourceIds = collectJointSourceMemberIds(teeSheet);
  const finalIds = collectCanonicalMemberIds(canonicalGroups);
  const dropped = sourceIds.filter((id) => !finalIds.includes(id));
  const societiesInPayload = societiesRepresentedInCanonical(canonicalGroups, teeSheet.participating_societies);

  console.log("[teesheet] canonical source groups", {
    eventId,
    groupCount: teeSheet.groups?.length ?? 0,
    sourceMemberIds: sourceIds,
    societiesInPayload,
  });
  console.log("[teesheet] canonical hydrated players", {
    eventId,
    groupCount: canonicalGroups.length,
    canonicalMemberIds: finalIds,
    missingMemberIds: dropped,
    societiesInPayload,
  });
  if (dropped.length > 0) {
    console.log("[teesheet] canonical dropped rows", {
      eventId,
      droppedCount: dropped.length,
      droppedMemberIds: dropped,
    });
    for (const id of dropped) {
      const sourceGroupIndex = (teeSheet.groups ?? []).findIndex((g) =>
        (g.entries ?? []).some((e) => String(e.player_id) === id),
      );
      console.warn("[teesheet] PLAYER DROPPED FROM CANONICAL", {
        eventId,
        memberId: id,
        sourceGroupIndex,
        likelyReason:
          "jointGroupsToCanonical skipped empty group or mapping bug — not eligibility (joint load uses unfiltered getJointEventTeeSheet)",
      });
    }
  }
}

/** Build tee time HH:MM from event start + interval (group index 1-based → 0-based slot). */
function teeTimeForGroupSlot(
  start: string | null | undefined,
  intervalMinutes: number,
  groupNumber: number,
): string {
  const startStr = (start || DEFAULT_START).trim() || DEFAULT_START;
  const [hs, ms] = startStr.split(":");
  const h = Number(hs);
  const m = Number(ms);
  const startMins = (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);
  const interval = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : DEFAULT_INTERVAL;
  const idx = Math.max(0, groupNumber - 1);
  const totalMins = startMins + idx * interval;
  const th = Math.floor(totalMins / 60) % 24;
  const tm = totalMins % 60;
  return `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}`;
}

function jointGroupsToCanonical(ts: JointEventTeeSheet): CanonicalGroupRow[] {
  const ev = ts.event;
  const start = ev.tee_time_start ?? DEFAULT_START;
  const interval =
    typeof ev.tee_time_interval === "number" && ev.tee_time_interval! > 0 ? ev.tee_time_interval! : DEFAULT_INTERVAL;

  const out: CanonicalGroupRow[] = [];
  for (const g of ts.groups ?? []) {
    const entries = g.entries ?? [];
    if (entries.length === 0) continue;

    let teeTime: string;
    if (g.tee_time && String(g.tee_time).length >= 4) {
      const raw = String(g.tee_time);
      teeTime = raw.length > 5 ? teeTimeToDisplay(raw) : raw.slice(0, 5);
    } else {
      teeTime = teeTimeForGroupSlot(start, interval, g.group_number);
    }

    const players: CanonicalPlayerRow[] = entries.map((e) => ({
      id: String(e.player_id),
      name: (e.player_name && String(e.player_name).trim()) || `Member ${String(e.player_id).slice(0, 8)}…`,
      handicapIndex: e.handicap_index ?? null,
      societyLabel:
        (e.society_memberships?.length ?? 0) > 1
          ? e.society_memberships.join(" & ")
          : e.primary_display_society ?? e.society_memberships?.[0] ?? undefined,
    }));

    out.push({ groupNumber: g.group_number, teeTime, players });
  }
  out.sort((a, b) => a.groupNumber - b.groupNumber);
  return out;
}

function standardDbToCanonical(
  teeGroups: TeeGroupRow[],
  teeGroupPlayers: TeeGroupPlayerRow[],
  members: MemberDoc[],
  guests: { id: string; name: string; sex: "male" | "female" | null; handicap_index: number | null }[],
  eligible: Set<string>,
  isJoint: boolean,
  societyIdToName?: Map<string, string>,
): CanonicalGroupRow[] {
  const filtered = filterTeeGroupPlayersForEligibility(teeGroupPlayers, eligible);
  if (teeGroups.length === 0 || filtered.length === 0) return [];

  const lookup = (playerId: string): GroupedPlayer | null => {
    if (playerId.startsWith("guest-")) {
      const g = guests.find((x) => x.id === playerId.slice(6));
      return g
        ? {
            id: playerId,
            name: g.name,
            handicapIndex: g.handicap_index ?? null,
            courseHandicap: null,
            playingHandicap: null,
          }
        : null;
    }
    const m = members.find((x) => x.id === playerId);
    if (!m) return null;
    return {
      id: m.id,
      name: resolveAttendeeDisplayName(m, { memberId: m.id }).name,
      handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
      courseHandicap: null,
      playingHandicap: null,
      societyLabel:
        isJoint && societyIdToName && societyIdToName.size > 0
          ? societyLabelFromMember(m, societyIdToName) ?? undefined
          : undefined,
    } as GroupedPlayer;
  };

  const byGroup = new Map<number, { teeTime: string; players: { player_id: string; position: number }[] }>();
  for (const g of teeGroups) {
    byGroup.set(g.group_number, { teeTime: g.tee_time ? teeTimeToDisplay(g.tee_time) : "08:00", players: [] });
  }
  for (const p of filtered) {
    const data = byGroup.get(p.group_number);
    if (data) data.players.push({ player_id: p.player_id, position: p.position });
  }
  for (const [, data] of byGroup) {
    data.players.sort((a, b) => a.position - b.position);
  }

  const rows: CanonicalGroupRow[] = [];
  for (const groupNumber of [...byGroup.keys()].sort((a, b) => a - b)) {
    const data = byGroup.get(groupNumber)!;
    let players = data.players
      .map(({ player_id }) => lookup(player_id))
      .filter(Boolean) as GroupedPlayer[];
    if (isJoint && societyIdToName && societyIdToName.size > 0) {
      players = dedupeJointGroupedPlayers(players, members, societyIdToName);
    }
    if (players.length === 0) continue;
    rows.push({
      groupNumber,
      teeTime: data.teeTime,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        handicapIndex: p.handicapIndex ?? null,
        societyLabel: p.societyLabel ?? undefined,
      })),
    });
  }
  return rows;
}

function standardComputedToCanonical(
  event: EventDoc,
  members: MemberDoc[],
  eligibleMemberIds: string[],
  guests: { id: string; name: string; sex: "male" | "female" | null; handicap_index: number | null }[],
): CanonicalGroupRow[] {
  const playerIds = event.playerIds?.length ? event.playerIds : eligibleMemberIds;
  const subset = members.filter((m) => playerIds.includes(m.id));
  const guestPlayers: GroupedPlayer[] = guests.map((g) => ({
    id: `guest-${g.id}`,
    name: g.name,
    handicapIndex: g.handicap_index ?? null,
    courseHandicap: null,
    playingHandicap: null,
  }));
  const memberPlayers: GroupedPlayer[] = subset.map((m) => ({
    id: m.id,
    name: resolveAttendeeDisplayName(m, { memberId: m.id }).name,
    handicapIndex: m.handicapIndex ?? m.handicap_index ?? null,
    courseHandicap: null,
    playingHandicap: null,
  }));
  const allPlayers = [...memberPlayers, ...guestPlayers];
  if (allPlayers.length === 0) return [];

  const groups = groupPlayers(allPlayers, true);
  const start = event.teeTimeStart ?? DEFAULT_START;
  const interval =
    Number.isFinite(event.teeTimeInterval) && (event.teeTimeInterval ?? 0) > 0
      ? Number(event.teeTimeInterval)
      : DEFAULT_INTERVAL;
  const withTimes = assignTeeTimes(groups, start, interval);
  return withTimes.map((g) => ({
    groupNumber: g.groupNumber,
    teeTime: g.teeTime ?? "08:00",
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      handicapIndex: p.handicapIndex ?? null,
    })),
  }));
}

/**
 * Load the canonical tee sheet for an event (published or not).
 * Prefer this for dashboard, member view, and export after publish.
 */
export async function loadCanonicalTeeSheet(eventId: string): Promise<CanonicalTeeSheetResult | null> {
  if (!eventId?.trim()) return null;

  const event = await getEvent(eventId);
  if (__DEV__) {
    console.log("[tee-debug] EVENT RAW", event === null ? null : {
      id: event.id,
      society_id: event.society_id,
      tee_time_published_at: event.teeTimePublishedAt ?? null,
      player_ids_len: event.playerIds?.length ?? 0,
      schema_note:
        "Joint events use event_societies (no guest_society_id on events); host is society_id.",
    });
  }
  if (!event) {
    if (__DEV__) {
      console.log(
        "[tee-debug] loadCanonicalTeeSheet: getEvent returned null — if user is participant society, events SELECT RLS likely blocked host row (see migration 080_events_select_joint_participants).",
      );
    }
    return null;
  }

  // getEvent() does NOT enrich is_joint_event — it's derived from event_societies.
  // We MUST check the canonical source (event_societies) to decide joint mode.
  const jointMetaMap = await getJointMetaForEventIds([eventId]);
  const jointMeta = jointMetaMap.get(eventId);
  const isJoint = jointMeta?.is_joint_event === true;

  const published = !!event.teeTimePublishedAt;
  if (__DEV__) {
    console.log("[teesheet] joint mode decision", {
      source: "lib/teeSheet/canonicalTeeSheet.ts::loadCanonicalTeeSheet",
      eventId,
      event_is_joint_event: event.is_joint_event ?? null,
      jointMetaIsJoint: isJoint,
      linkedSocietiesCount: jointMeta?.linkedSocietyCount ?? null,
      participantSocietiesCount: null,
      jointDecision: isJoint,
    });
  }
  const base: Pick<CanonicalTeeSheetResult, "eventId" | "published" | "event"> = {
    eventId,
    published,
    event,
  };

  if (isJoint) {
    const jd = await getJointEventDetail(eventId);
    const jointParticipatingSocieties =
      jd?.participating_societies?.map((s) => ({
        society_id: s.society_id,
        society_name: s.society_name,
      })) ?? [];

    /**
     * Use **unfiltered** `getJointEventTeeSheet` — not `loadJointTeeSheetForManCo`.
     * The latter applied `filterJointTeeSheetByEligible`, which dropped guest-society players
     * whenever `getEventRegistrations` + joint scope did not include their rows (RLS/context),
     * even though pairings were saved and visible in the editor.
     */
    const teeSheet = await getJointEventTeeSheet(eventId, jd ?? undefined);
    if (!teeSheet) {
      const empty: CanonicalTeeSheetResult = {
        ...base,
        isJoint: true,
        source: "computed_fallback",
        jointParticipatingSocieties,
        groups: [],
      };
      logCanonicalDebug("load", {
        eventId,
        source: empty.source,
        groupCount: 0,
        playerCount: 0,
        playerIdsSample: [],
        teeTimes: [],
      });
      return empty;
    }

    const groups = jointGroupsToCanonical(teeSheet);
    const flatIds = groups.flatMap((g) => g.players.map((p) => p.id));
    logDevJointCanonicalPipeline(eventId, teeSheet, groups);

    const result: CanonicalTeeSheetResult = {
      ...base,
      isJoint: true,
      source: "joint_entries",
      event: mapJointEventToEventDoc(teeSheet.event) as EventDoc,
      jointParticipatingSocieties,
      groups,
    };
    logCanonicalDebug("load", {
      eventId,
      source: result.source,
      groupCount: groups.length,
      playerCount: flatIds.length,
      playerIdsSample: flatIds.slice(0, 10),
      teeTimes: groups.map((g) => g.teeTime),
    });
    logTeeSheetLoadSource(eventId, result.source, groups, jointParticipatingSocieties);
    return result;
  }

  // Standard (single-society host)
  const hostId = event.society_id ?? "";
  const [teeGroups, teeGroupPlayers, registrations, guests] = await Promise.all([
    getTeeGroups(eventId),
    getTeeGroupPlayers(eventId),
    getEventRegistrations(eventId),
    getEventGuests(eventId),
  ]);

  const scoped = scopeEventRegistrations(registrations, { kind: "standard", hostSocietyId: hostId });
  const eligible = eligibleMemberIdSetFromRegistrations(scoped);

  let members = await getMembersBySocietyId(hostId);
  const needIds = new Set<string>();
  for (const row of teeGroupPlayers) {
    const id = String(row.player_id);
    if (!id.startsWith("guest-") && !members.some((m) => m.id === id)) needIds.add(id);
  }
  if (needIds.size > 0) {
    const extra = await getMembersByIds([...needIds]);
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const m of extra) {
      if (m?.id && !byId.has(m.id)) byId.set(m.id, m);
    }
    members = Array.from(byId.values());
  }

  if (teeGroups.length > 0 && teeGroupPlayers.length > 0) {
    const groups = standardDbToCanonical(teeGroups, teeGroupPlayers, members, guests, eligible, false);
    const flatIds = groups.flatMap((g) => g.players.map((p) => p.id));
    const result: CanonicalTeeSheetResult = {
      ...base,
      isJoint: false,
      source: "tee_groups",
      groups,
    };
    logCanonicalDebug("load", {
      eventId,
      source: result.source,
      groupCount: groups.length,
      playerCount: flatIds.length,
      playerIdsSample: flatIds.slice(0, 10),
      teeTimes: groups.map((g) => g.teeTime),
    });
    logTeeSheetLoadSource(eventId, result.source, groups);
    return result;
  }

  const regIds = scoped.filter(isTeeSheetEligible).map((r) => r.member_id);
  const groups =
    published ? standardComputedToCanonical(event, members, regIds, guests) : [];

  const result: CanonicalTeeSheetResult = {
    ...base,
    isJoint: false,
    source: "computed_fallback",
    groups,
  };
  const flatIds = groups.flatMap((g) => g.players.map((p) => p.id));
  logCanonicalDebug("load", {
    eventId,
    source: result.source,
    groupCount: groups.length,
    playerCount: flatIds.length,
    playerIdsSample: flatIds.slice(0, 10),
    teeTimes: groups.map((g) => g.teeTime),
  });
  logTeeSheetLoadSource(eventId, result.source, groups);
  return result;
}

/** Find current member's group using canonical rows (joint-aware representative id). */
export function findMemberGroupInfoFromCanonical(
  memberId: string,
  canonical: CanonicalTeeSheetResult,
  members: MemberDoc[],
  societyIdToName?: Map<string, string>,
): MemberGroupInfo | null {
  if (!memberId || !canonical.groups.length) return null;

  const repId =
    societyIdToName && societyIdToName.size > 0
      ? representativeMemberIdForJoint(memberId, members, societyIdToName)
      : memberId;

  for (const g of canonical.groups) {
    const idx = g.players.findIndex((p) => p.id === memberId || p.id === repId);
    if (idx === -1) continue;

    const groupMates = g.players
      .filter((p) => p.id !== memberId && p.id !== repId)
      .map((p) => (p.societyLabel ? `${p.name} · ${p.societyLabel}` : p.name));

    return {
      groupIndex: Math.max(0, g.groupNumber - 1),
      groupNumber: g.groupNumber,
      teeTime: g.teeTime,
      groupMates,
    };
  }
  return null;
}

export type BuildTeeSheetDataFromCanonicalOpts = {
  societyId?: string;
  societyName: string;
  logoUrl?: string | null;
  jointSocieties?: { societyId: string; societyName: string; logoUrl?: string | null }[];
  manCo: ManCoDetails;
  nearestPinHoles: number[] | null;
  longestDriveHoles: number[] | null;
  startTime: string | null;
  teeTimeInterval: number;
};

/** Build share/PDF payload from canonical groups (no re-grouping). */
export function buildTeeSheetDataFromCanonical(
  canonical: CanonicalTeeSheetResult,
  opts: BuildTeeSheetDataFromCanonicalOpts,
): TeeSheetData {
  const ev = canonical.event;
  const players: TeeSheetData["players"] = canonical.groups.flatMap((g) =>
    g.players.map((p) => ({
      id: p.id,
      name: p.name,
      handicapIndex: p.handicapIndex,
      gender: null as "male" | "female" | null,
      group: g.groupNumber,
      teeTime: g.teeTime,
    })),
  );

  return {
    societyId: opts.societyId,
    societyName: opts.societyName,
    logoUrl: opts.logoUrl,
    jointSocieties: opts.jointSocieties,
    manCo: opts.manCo,
    eventName: ev.name || "Event",
    eventDate: ev.date || null,
    courseName: ev.courseName || null,
    startTime: opts.startTime,
    teeTimeInterval: opts.teeTimeInterval,
    nearestPinHoles: opts.nearestPinHoles,
    longestDriveHoles: opts.longestDriveHoles,
    teeName: ev.teeName || null,
    ladiesTeeName: ev.ladiesTeeName || null,
    teeSettings:
      ev.par != null && ev.courseRating != null && ev.slopeRating != null
        ? { par: ev.par, courseRating: ev.courseRating, slopeRating: ev.slopeRating }
        : null,
    ladiesTeeSettings:
      ev.ladiesPar != null && ev.ladiesCourseRating != null && ev.ladiesSlopeRating != null
        ? { par: ev.ladiesPar, courseRating: ev.ladiesCourseRating, slopeRating: ev.ladiesSlopeRating }
        : null,
    handicapAllowance: ev.handicapAllowance ?? null,
    format: ev.format ?? null,
    players,
    preGrouped: true,
  };
}

/** DEV-only: compare two canonical snapshots and warn on mismatch. */
export function warnIfCanonicalMismatch(a: CanonicalTeeSheetResult | null, b: CanonicalTeeSheetResult | null, label: string) {
  if (!__DEV__ || !a || !b) return;
  const sig = (c: CanonicalTeeSheetResult) =>
    JSON.stringify({
      s: c.source,
      g: c.groups.map((x) => ({
        n: x.groupNumber,
        t: x.teeTime,
        p: x.players.map((p) => p.id),
      })),
    });
  if (sig(a) !== sig(b)) {
    console.warn("[teesheet] PAYLOAD MISMATCH", label, { a: sig(a), b: sig(b) });
  }
}
