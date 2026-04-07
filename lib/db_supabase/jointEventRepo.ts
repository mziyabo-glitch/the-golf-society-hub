/**
 * Phase 2/3 Joint Events: Read model and mutations for joint event detail.
 *
 * **Joint playable source of truth:** `event_entries` (`player_id` = society member id), not
 * `events.player_ids`. Tee sheet, Points, and Players save paths must keep dual members expanded
 * to one row per participating-society member id (see `expandJointRepresentativesToParticipatingMemberIds`
 * and `expandJointTeeSheetReplaceRowsForParticipatingSocieties`).
 *
 * ADDITIVE: This module does NOT replace getEvent or the existing event detail flow.
 * There is always one master event row per event; event_societies is the relational
 * source of truth for which societies participate. Standard (single-society) events
 * must not accidentally write event_societies rows.
 *
 * Detection: An event is joint only when there are 2+ distinct participating
 * societies (event_societies rows). One row alone does not make an event joint.
 * Use isEventJoint() or getJointEventDetail and payload.event.is_joint_event.
 */

import { supabase } from "@/lib/supabase";
import { createEvent } from "@/lib/db_supabase/eventRepo";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type {
  JointEventDetail,
  JointEventCreateInput,
  JointEventUpdateInput,
  EventSocietyInput,
  JointEventTeeSheet,
  JointEventTeeSheetEntry,
  JointEventTeeSheetGroup,
  JointEventEntry,
  JointEventSociety,
} from "./jointEventTypes";
import { getMembersByIds, type MemberDoc } from "./memberRepo";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import { canonicalJointPersonKey, dedupeJointMembers } from "@/lib/jointPersonDedupe";

const DEBUG = __DEV__;

/** Canonical joint rule: `event_societies` has 2+ distinct society_id values (matches RPC v_is_joint). */
export type EventJointMeta = {
  is_joint_event: boolean;
  linkedSocietyCount: number;
  /** Distinct society_id from event_societies for this event (access / UX; not guest_society_id). */
  participantSocietyIds: string[];
};

/**
 * Batch-load joint classification from `event_societies` (single source of truth).
 * Same rule everywhere: distinct society count >= 2 ⇒ joint.
 */
export async function getJointMetaForEventIds(
  eventIds: string[],
): Promise<Map<string, EventJointMeta>> {
  const result = new Map<string, EventJointMeta>();
  const ids = [...new Set(eventIds.map((id) => id?.trim()).filter(Boolean) as string[])];
  for (const id of ids) {
    result.set(id, { is_joint_event: false, linkedSocietyCount: 0, participantSocietyIds: [] });
  }
  if (ids.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from("event_societies")
      .select("event_id, society_id")
      .in("event_id", ids);

    if (error) {
      if (DEBUG) console.warn("[jointEventRepo] getJointMetaForEventIds error:", error.message);
      return result;
    }

    const byEvent = new Map<string, Set<string>>();
    for (const row of data ?? []) {
      const eid = row.event_id as string | undefined;
      const sid = row.society_id as string | undefined;
      if (!eid) continue;
      if (!byEvent.has(eid)) byEvent.set(eid, new Set());
      if (sid) byEvent.get(eid)!.add(sid);
    }

    for (const id of ids) {
      const set = byEvent.get(id) ?? new Set();
      const linkedSocietyCount = set.size;
      const participantSocietyIds = [...set].sort((a, b) => a.localeCompare(b));
      result.set(id, {
        is_joint_event: linkedSocietyCount >= 2,
        linkedSocietyCount,
        participantSocietyIds,
      });
    }
  } catch {
    // leave defaults
  }

  return result;
}

/**
 * Check if an event is a joint event (2+ distinct participating societies).
 * Prefer using `EventDoc.is_joint_event` from repo-enriched loads when available.
 */
export async function isEventJoint(eventId: string): Promise<boolean> {
  if (!eventId?.trim()) return false;
  const meta = await getJointMetaForEventIds([eventId]);
  return meta.get(eventId)?.is_joint_event ?? false;
}

/**
 * Fetch normalized joint event detail from the RPC.
 * Works for both joint and non-joint events. For non-joint events,
 * participating_societies, entries, and leaderboard_scopes (beyond overall)
 * will be empty.
 *
 * @param eventId - UUID of the event
 * @returns Normalized payload or null if not found / no access
 */
export async function getJointEventDetail(
  eventId: string
): Promise<JointEventDetail | null> {
  if (!eventId?.trim()) {
    if (DEBUG) console.warn("[jointEventRepo] getJointEventDetail: empty eventId");
    return null;
  }

  try {
    const { data, error } = await supabase.rpc("get_joint_event_detail", {
      p_event_id: eventId,
    });

    if (error) {
      console.error("[jointEventRepo] get_joint_event_detail RPC error:", {
        eventId,
        message: error.message,
        code: error.code,
      });
      return null;
    }

    if (data == null) {
      if (DEBUG) console.log("[jointEventRepo] getJointEventDetail: no data (not found or no access)", eventId);
      return null;
    }

    const raw = data as unknown;
    const payload = normalizeJointEventPayload(raw);

    if (DEBUG) {
      console.log("[jointEventRepo] getJointEventDetail:", {
        eventId,
        isJoint: payload?.event?.is_joint_event ?? false,
        societiesCount: payload?.participating_societies?.length ?? 0,
        entriesCount: payload?.entries?.length ?? 0,
      });
    }

    return payload;
  } catch (err) {
    console.error("[jointEventRepo] getJointEventDetail exception:", err);
    return null;
  }
}

/**
 * Return event IDs where the given society is a participating society (event_societies).
 * Used to show joint events in tee sheet event list for participant societies.
 */
export async function getEventIdsWhereSocietyParticipates(societyId: string): Promise<string[]> {
  if (!societyId?.trim()) return [];
  try {
    const { data, error } = await supabase
      .from("event_societies")
      .select("event_id")
      .eq("society_id", societyId);
    if (error) {
      if (DEBUG) console.warn("[jointEventRepo] getEventIdsWhereSocietyParticipates error:", error.message);
      return [];
    }
    const ids = [...new Set((data ?? []).map((r) => r.event_id as string).filter(Boolean))];
    return ids;
  } catch {
    return [];
  }
}

/** Build tee time string from start + interval * (groupIndex). Group index 0-based. */
function buildTeeTimeForGroup(
  startTime: string | null,
  intervalMinutes: number,
  groupIndex: number
): string {
  const start = (startTime || "08:00").trim() || "08:00";
  const [h, m] = start.split(":").map(Number);
  const startMins = (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 0);
  const interval = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes : 10;
  const totalMins = startMins + groupIndex * interval;
  const th = Math.floor(totalMins / 60) % 24;
  const tm = totalMins % 60;
  return `${String(th).padStart(2, "0")}:${String(tm).padStart(2, "0")}`;
}

function memberDocForPlayer(playerId: string, memberById: Map<string, MemberDoc>): MemberDoc {
  const m = memberById.get(playerId);
  if (m) return m;
  return { id: playerId, society_id: "" };
}

/**
 * Merge multiple `event_entries` that map to the same real person (dual membership / shared auth).
 */
function mergeJointEntryCluster(
  cluster: JointEventEntry[],
  memberById: Map<string, MemberDoc>,
  societyIdToName: Map<string, string>,
  participating_societies: JointEventSociety[],
  startTime: string | null,
  interval: number,
): JointEventTeeSheetEntry | null {
  if (cluster.length === 0) return null;

  const memberDocs = cluster.map((e) => memberDocForPlayer(e.player_id, memberById));
  const deduped = dedupeJointMembers(memberDocs, societyIdToName);
  const d = deduped[0];
  if (!d) return null;

  const repId = d.representative.id;
  const sortedCluster = [...cluster].sort((a, b) => {
    const ga = a.pairing_group ?? 9999;
    const gb = b.pairing_group ?? 9999;
    if (ga !== gb) return ga - gb;
    const pa = a.pairing_position ?? 9999;
    const pb = b.pairing_position ?? 9999;
    if (pa !== pb) return pa - pb;
    return a.event_entry_id.localeCompare(b.event_entry_id);
  });

  const repEntry =
    sortedCluster.find((e) => e.player_id === repId) ?? sortedCluster[0];

  const all_event_entry_ids = [
    ...new Set(cluster.map((e) => e.event_entry_id).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const nameSet = new Set<string>();
  for (const e of cluster) {
    const societyIds = Array.isArray(e.eligibility) ? e.eligibility.map((x) => x.society_id).filter(Boolean) : [];
    const namesFromParticipating = societyIds
      .map((sid) => participating_societies.find((s) => s.society_id === sid)?.society_name)
      .filter(Boolean) as string[];
    if (namesFromParticipating.length > 0) {
      for (const n of namesFromParticipating) nameSet.add(n);
    } else {
      for (const s of e.society_memberships ?? []) {
        const sid = String(s);
        nameSet.add(societyIdToName.get(sid) ?? sid);
      }
    }
  }

  const society_memberships = [...nameSet].sort((a, b) => a.localeCompare(b));
  const primary_display_society = society_memberships[0] ?? null;

  const grp = repEntry.pairing_group != null && Number.isFinite(repEntry.pairing_group)
    ? repEntry.pairing_group
    : null;
  const pos =
    repEntry.pairing_position != null && Number.isFinite(repEntry.pairing_position)
      ? repEntry.pairing_position
      : null;
  const tee_time = grp != null ? buildTeeTimeForGroup(startTime, interval, grp - 1) : null;

  const hi = d.representative.handicapIndex ?? d.representative.handicap_index ?? null;

  return {
    event_entry_id: repEntry.event_entry_id ?? "",
    player_id: repId,
    player_name:
      d.representative.displayName ||
      d.representative.name ||
      repEntry.player_name ||
      "Player",
    tee_id: repEntry.tee_id ?? null,
    tee_name: repEntry.tee_name ?? "",
    tee_time,
    pairing_group: grp,
    pairing_position: pos,
    status: repEntry.status ?? "confirmed",
    society_memberships,
    primary_display_society,
    handicap_index: hi,
    all_event_entry_ids,
  };
}

/**
 * Phase 4: Tee-sheet-ready read model for joint events.
 * One combined tee sheet; no duplicate players; groups are event-wide (mixed societies allowed).
 * Returns empty groups/entries if none; does not crash on partial tee times.
 *
 * @param detailFromCaller — when set (including `null`), skips a duplicate `getJointEventDetail` RPC.
 */
export async function getJointEventTeeSheet(
  eventId: string,
  detailFromCaller?: JointEventDetail | null,
): Promise<JointEventTeeSheet | null> {
  if (!eventId?.trim()) return null;

  let detail: JointEventDetail | null;
  if (detailFromCaller === undefined) {
    detail = await getJointEventDetail(eventId);
  } else {
    detail = detailFromCaller;
  }
  if (!detail) return null;

  const ev = detail.event;
  const participating_societies = detail.participating_societies ?? [];
  const entries = detail.entries ?? [];
  const startTime = ev.tee_time_start ?? null;
  const interval = typeof ev.tee_time_interval === "number" && ev.tee_time_interval > 0
    ? ev.tee_time_interval
    : 10;
  const is_published = ev.tee_time_published_at != null && ev.tee_time_published_at !== "";

  const societyIdToName = buildSocietyIdToNameMap(participating_societies);
  const playerIds = [...new Set(entries.map((e) => e.player_id).filter(Boolean))];
  const memberRows = await getMembersByIds(playerIds);
  const memberById = new Map(memberRows.map((m) => [m.id, m]));

  const clusters = new Map<string, JointEventEntry[]>();
  for (const e of entries) {
    if (!e.player_id) continue;
    const doc = memberDocForPlayer(e.player_id, memberById);
    const k = canonicalJointPersonKey(doc);
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k)!.push(e);
  }

  const teeSheetEntries: JointEventTeeSheetEntry[] = [];
  for (const [, cluster] of clusters) {
    const merged = mergeJointEntryCluster(
      cluster,
      memberById,
      societyIdToName,
      participating_societies,
      startTime,
      interval,
    );
    if (merged) teeSheetEntries.push(merged);
  }

  teeSheetEntries.sort((a, b) => {
    const ga = a.pairing_group ?? 9999;
    const gb = b.pairing_group ?? 9999;
    if (ga !== gb) return ga - gb;
    const pa = a.pairing_position ?? 9999;
    const pb = b.pairing_position ?? 9999;
    return pa - pb;
  });

  const groupMap = new Map<number, JointEventTeeSheetEntry[]>();
  for (const entry of teeSheetEntries) {
    const grp =
      entry.pairing_group != null && Number.isFinite(entry.pairing_group)
        ? entry.pairing_group
        : 0;
    if (!groupMap.has(grp)) groupMap.set(grp, []);
    groupMap.get(grp)!.push(entry);
  }
  for (const arr of groupMap.values()) {
    arr.sort((a, b) => (a.pairing_position ?? 0) - (b.pairing_position ?? 0));
  }

  const sortedGroupNumbers = [...groupMap.keys()].sort((a, b) => {
    if (a === 0 && b !== 0) return -1;
    if (b === 0 && a !== 0) return 1;
    return a - b;
  });
  const groups: JointEventTeeSheetGroup[] = sortedGroupNumbers.map((group_number) => ({
    group_number,
    tee_time:
      group_number === 0
        ? null
        : buildTeeTimeForGroup(startTime, interval, group_number - 1),
    entries: groupMap.get(group_number) ?? [],
  }));

  if (DEBUG) {
    const duplicateCount = entries.length - teeSheetEntries.length;
    console.log("[jointEventRepo] getJointEventTeeSheet:", {
      eventId,
      is_joint: detail.event.is_joint_event,
      entriesCount: entries.length,
      uniqueEntries: teeSheetEntries.length,
      duplicatePlayerIdsDetected: duplicateCount > 0 ? duplicateCount : undefined,
      groupsCount: groups.length,
    });
  }

  return {
    event: ev,
    participating_societies: participating_societies,
    groups,
    entries: teeSheetEntries,
    is_joint_event: detail.event.is_joint_event === true,
    is_published,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Normalize the raw RPC response into a type-safe JointEventDetail.
 * Ensures arrays are never null, prevents blank-screen failures.
 */
function normalizeJointEventPayload(raw: unknown): JointEventDetail | null {
  if (raw == null || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const event = obj.event as Record<string, unknown> | undefined;
  if (!event || typeof event !== "object") return null;

  const participating_societies = Array.isArray(obj.participating_societies)
    ? obj.participating_societies
    : [];
  const entries = Array.isArray(obj.entries) ? obj.entries : [];
  const leaderboard_scopes = Array.isArray(obj.leaderboard_scopes)
    ? obj.leaderboard_scopes
    : [];
  const meta = (obj.meta && typeof obj.meta === "object") ? obj.meta as Record<string, unknown> : {};

  return {
    event: {
      id: String(event.id ?? ""),
      title: String(event.title ?? event.name ?? ""),
      event_date: event.event_date != null ? String(event.event_date) : null,
      format: String(event.format ?? "stableford"),
      classification: String(event.classification ?? "general"),
      host_society_id: String(event.host_society_id ?? event.society_id ?? ""),
      society_id: String(event.society_id ?? ""),
      is_joint_event: Boolean(event.is_joint_event),
      status: String(event.status ?? "upcoming"),
      course_id: event.course_id != null ? String(event.course_id) : null,
      course_name: event.course_name != null ? String(event.course_name) : null,
      created_by: event.created_by != null ? String(event.created_by) : null,
      created_at: event.created_at != null ? String(event.created_at) : null,
      tee_id: event.tee_id != null ? String(event.tee_id) : null,
      tee_name: event.tee_name != null ? String(event.tee_name) : null,
      par: typeof event.par === "number" ? event.par : null,
      course_rating: typeof event.course_rating === "number" ? event.course_rating : null,
      slope_rating: typeof event.slope_rating === "number" ? event.slope_rating : null,
      handicap_allowance: typeof event.handicap_allowance === "number" ? event.handicap_allowance : null,
      ladies_tee_name: event.ladies_tee_name != null ? String(event.ladies_tee_name) : null,
      ladies_par: typeof event.ladies_par === "number" ? event.ladies_par : null,
      ladies_course_rating: typeof event.ladies_course_rating === "number" ? event.ladies_course_rating : null,
      ladies_slope_rating: typeof event.ladies_slope_rating === "number" ? event.ladies_slope_rating : null,
      tee_time_start: event.tee_time_start != null ? String(event.tee_time_start) : null,
      tee_time_interval: typeof event.tee_time_interval === "number" ? event.tee_time_interval : null,
      tee_time_published_at: event.tee_time_published_at != null ? String(event.tee_time_published_at) : null,
      nearest_pin_holes: Array.isArray(event.nearest_pin_holes)
        ? event.nearest_pin_holes.filter((n): n is number => typeof n === "number")
        : null,
      longest_drive_holes: Array.isArray(event.longest_drive_holes)
        ? event.longest_drive_holes.filter((n): n is number => typeof n === "number")
        : null,
      tee_source: event.tee_source != null ? String(event.tee_source) : null,
      income_pence: typeof event.income_pence === "number" ? event.income_pence : null,
      costs_pence: typeof event.costs_pence === "number" ? event.costs_pence : null,
      is_completed: typeof event.is_completed === "boolean" ? event.is_completed : null,
      is_oom: typeof event.is_oom === "boolean" ? event.is_oom : null,
      rsvp_deadline_at:
        event.rsvp_deadline_at != null ? String(event.rsvp_deadline_at) : null,
    },
    participating_societies: participating_societies.map(normalizeSociety),
    entries: entries.map(normalizeEntry),
    leaderboard_scopes: leaderboard_scopes.map(normalizeScope),
    meta: {
      can_manage_event: Boolean(meta.can_manage_event),
      can_score_event: Boolean(meta.can_score_event),
      can_publish_results: Boolean(meta.can_publish_results),
      generated_at: String(meta.generated_at ?? new Date().toISOString()),
      has_entries: Boolean(meta.has_entries),
      has_participating_societies: Boolean(meta.has_participating_societies),
    },
  };
}

function normalizeSociety(obj: unknown): import("./jointEventTypes").JointEventSociety {
  const o = (obj && typeof obj === "object") ? obj as Record<string, unknown> : {};
  return {
    event_society_id: String(o.event_society_id ?? ""),
    society_id: String(o.society_id ?? ""),
    society_name: String(o.society_name ?? ""),
    role: (o.role === "host" ? "host" : "participant") as "host" | "participant",
    has_society_oom: Boolean(o.has_society_oom !== false),
    society_oom_name: String(o.society_oom_name ?? ""),
  };
}

function normalizeEntry(obj: unknown): import("./jointEventTypes").JointEventEntry {
  const o = (obj && typeof obj === "object") ? obj as Record<string, unknown> : {};
  const elig = Array.isArray(o.eligibility) ? o.eligibility : [];
  const memberships = Array.isArray(o.society_memberships) ? o.society_memberships : [];
  return {
    event_entry_id: String(o.event_entry_id ?? ""),
    player_id: String(o.player_id ?? ""),
    player_name: String(o.player_name ?? "Player"),
    tee_id: o.tee_id != null ? String(o.tee_id) : null,
    tee_name: String(o.tee_name ?? ""),
    status: String(o.status ?? "confirmed"),
    pairing_group: typeof o.pairing_group === "number" ? o.pairing_group : null,
    pairing_position: typeof o.pairing_position === "number" ? o.pairing_position : null,
    is_scoring: Boolean(o.is_scoring),
    society_memberships: memberships.map((m) => String(m)),
    eligibility: elig.map((e) => normalizeEligibility(e)),
  };
}

function normalizeEligibility(obj: unknown): import("./jointEventTypes").JointEventEntryEligibility {
  const o = (obj && typeof obj === "object") ? obj as Record<string, unknown> : {};
  return {
    society_id: String(o.society_id ?? ""),
    is_eligible_for_society_results: Boolean(o.is_eligible_for_society_results !== false),
    is_eligible_for_society_oom: Boolean(o.is_eligible_for_society_oom !== false),
    manual_override_reason: o.manual_override_reason != null ? String(o.manual_override_reason) : null,
  };
}

/**
 * Map JointEventDetailEvent to EventDoc-like shape for UI compatibility.
 * Use when rendering joint event in screens that expect EventDoc.
 */
export function mapJointEventToEventDoc(
  ev: import("./jointEventTypes").JointEventDetailEvent
): EventDocLike {
  return {
    id: ev.id,
    society_id: ev.society_id,
    name: ev.title,
    is_joint_event: ev.is_joint_event === true,
    date: ev.event_date ?? undefined,
    course_id: ev.course_id ?? undefined,
    courseId: ev.course_id ?? undefined,
    courseName: ev.course_name ?? undefined,
    tee_id: ev.tee_id ?? undefined,
    format: (ev.format as EventDocLike["format"]) ?? "stableford",
    classification: (ev.classification as EventDocLike["classification"]) ?? "general",
    status: ev.status,
    teeName: ev.tee_name ?? undefined,
    par: ev.par ?? undefined,
    courseRating: ev.course_rating ?? undefined,
    slopeRating: ev.slope_rating ?? undefined,
    handicapAllowance: ev.handicap_allowance ?? undefined,
    ladiesTeeName: ev.ladies_tee_name ?? undefined,
    ladiesPar: ev.ladies_par ?? undefined,
    ladiesCourseRating: ev.ladies_course_rating ?? undefined,
    ladiesSlopeRating: ev.ladies_slope_rating ?? undefined,
    teeTimeStart: ev.tee_time_start ?? undefined,
    teeTimeInterval: ev.tee_time_interval ?? undefined,
    teeTimePublishedAt: ev.tee_time_published_at ?? undefined,
    nearestPinHoles: ev.nearest_pin_holes ?? undefined,
    longestDriveHoles: ev.longest_drive_holes ?? undefined,
    teeSource: ev.tee_source ?? undefined,
    created_at: ev.created_at ?? undefined,
    is_completed: ev.is_completed ?? false,
    is_oom: ev.is_oom ?? false,
    rsvp_deadline_at: ev.rsvp_deadline_at ?? null,
    rsvpDeadlineAt: ev.rsvp_deadline_at ?? null,
  };
}

/** Minimal EventDoc-like shape for UI rendering */
export interface EventDocLike {
  id: string;
  society_id: string;
  name?: string;
  /** Canonical: from RPC / event_societies (>=2 societies). */
  is_joint_event?: boolean;
  date?: string;
  course_id?: string;
  courseId?: string;
  courseName?: string;
  tee_id?: string;
  format?: string;
  classification?: string;
  status?: string;
  teeName?: string;
  par?: number;
  courseRating?: number;
  slopeRating?: number;
  handicapAllowance?: number;
  ladiesTeeName?: string;
  ladiesPar?: number;
  ladiesCourseRating?: number;
  ladiesSlopeRating?: number;
  teeTimeStart?: string;
  teeTimeInterval?: number;
  teeTimePublishedAt?: string;
  nearestPinHoles?: number[];
  longestDriveHoles?: number[];
  teeSource?: string;
  created_at?: string;
  is_completed?: boolean;
  is_oom?: boolean;
  rsvp_deadline_at?: string | null;
  rsvpDeadlineAt?: string | null;
}

// =============================================================================
// Phase 3: Create/Update mutations
// =============================================================================

export type JointEventValidationError = {
  field?: string;
  message: string;
};

/**
 * Validate joint event input before save.
 * Returns array of errors; empty if valid.
 */
export function validateJointEventInput(input: {
  is_joint_event: boolean;
  host_society_id: string;
  participating_societies: EventSocietyInput[];
}): JointEventValidationError[] {
  const errors: JointEventValidationError[] = [];

  if (!input.is_joint_event) {
    return [];
  }

  if (!input.host_society_id?.trim()) {
    errors.push({ field: "host_society_id", message: "Host society is required for joint events." });
  }

  const societies = input.participating_societies ?? [];
  if (societies.length < 2) {
    errors.push({
      field: "participating_societies",
      message: "Joint events require at least 2 participating societies.",
    });
  }

  const ids = societies.map((s) => s.society_id).filter(Boolean);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push({
      field: "participating_societies",
      message: "Duplicate societies are not allowed.",
    });
  }

  const hostCount = societies.filter((s) => s.role === "host").length;
  if (hostCount !== 1) {
    errors.push({
      field: "participating_societies",
      message: "Exactly one society must be designated as host.",
    });
  }

  const hostInList = societies.some((s) => s.society_id === input.host_society_id);
  if (input.host_society_id && !hostInList) {
    errors.push({
      field: "host_society_id",
      message: "Host society must be included in participating societies.",
    });
  }

  return errors;
}

/**
 * Replace event_societies for an event (delete existing, then insert).
 * Phase 3 replacement strategy only; not the final long-term upsert model
 * (e.g. proper upsert or RPC may follow later). Call only for joint events;
 * standard events must not write event_societies.
 */
export async function upsertEventSocieties(
  eventId: string,
  participatingSocieties: EventSocietyInput[]
): Promise<void> {
  if (!eventId?.trim()) throw new Error("upsertEventSocieties: missing eventId");
  if (!Array.isArray(participatingSocieties) || participatingSocieties.length === 0) {
    return;
  }

  const rows = participatingSocieties.map((s) => ({
    event_id: eventId,
    society_id: s.society_id,
    role: s.role,
    has_society_oom: s.has_society_oom ?? true,
    society_oom_name: s.society_oom_name?.trim() || null,
  }));

  const { error: delErr } = await supabase
    .from("event_societies")
    .delete()
    .eq("event_id", eventId);

  if (delErr) {
    console.error("[jointEventRepo] upsertEventSocieties delete failed:", delErr);
    throw new Error(delErr.message || "Failed to update participating societies");
  }

  const { error: insErr } = await supabase.from("event_societies").insert(rows);

  if (insErr) {
    console.error("[jointEventRepo] upsertEventSocieties insert failed:", insErr);
    throw new Error(insErr.message || "Failed to save participating societies");
  }

  if (DEBUG) {
    console.log("[jointEventRepo] upsertEventSocieties: replaced for eventId", eventId, "with", rows.length, "rows");
  }
}

/** Assignment for one event_entry when saving joint event tee sheet */
export type EventEntryPairingAssignment = {
  event_entry_id: string;
  pairing_group: number | null;
  pairing_position: number | null;
};

/**
 * Phase 4: Update pairing_group and pairing_position for joint event entries.
 * Call after editing the tee sheet; does not publish tee times (use updateEvent/publishTeeTime for that).
 * RLS: only host society can update event_entries (event.society_id in my_society_ids).
 */
/** One row per player for full replace of `event_entries` (see RPC `replace_joint_event_tee_sheet_entries`). */
export type JointEventTeeSheetReplaceRow = {
  player_id: string;
  pairing_group: number | null;
  pairing_position: number | null;
};

/**
 * Joint tee sheet: DELETE all `event_entries` for the event, then INSERT fresh rows (SECURITY DEFINER RPC).
 * **Dual members:** callers must pass one row per participating-society `player_id` (same pairing_group/position);
 * do not collapse to a single representative id — use `expandJointTeeSheetReplaceRowsForParticipatingSocieties`.
 * Use instead of `updateEventEntriesPairings` when saving the full field — avoids missing `event_entry_id`
 * and RLS issues for participating-society ManCo.
 */
export async function replaceJointEventTeeSheetEntries(
  eventId: string,
  rows: JointEventTeeSheetReplaceRow[],
): Promise<void> {
  if (!eventId?.trim()) throw new Error("replaceJointEventTeeSheetEntries: missing eventId");
  const { error } = await supabase.rpc("replace_joint_event_tee_sheet_entries", {
    p_event_id: eventId,
    p_rows: rows,
  });
  if (error) {
    console.error("[jointEventRepo] replaceJointEventTeeSheetEntries:", error);
    throw new Error(error.message || "Failed to save joint tee sheet entries");
  }
  if (DEBUG) {
    console.log("[jointEventRepo] replaceJointEventTeeSheetEntries: eventId", eventId, "rows", rows.length);
  }
}

export async function updateEventEntriesPairings(
  eventId: string,
  assignments: EventEntryPairingAssignment[]
): Promise<void> {
  if (!eventId?.trim()) throw new Error("updateEventEntriesPairings: missing eventId");
  if (!Array.isArray(assignments)) return;

  for (const a of assignments) {
    if (!a.event_entry_id?.trim()) continue;
    const { error } = await supabase
      .from("event_entries")
      .update({
        pairing_group: a.pairing_group,
        pairing_position: a.pairing_position,
      })
      .eq("id", a.event_entry_id)
      .eq("event_id", eventId);
    if (error) {
      console.error("[jointEventRepo] updateEventEntriesPairings failed for entry", a.event_entry_id, error);
      throw new Error(error.message || "Failed to save tee sheet pairings");
    }
  }

  if (DEBUG) {
    console.log("[jointEventRepo] updateEventEntriesPairings: eventId", eventId, "updated", assignments.length, "entries");
  }
}

/**
 * Clear all saved tee-sheet pairings for a joint event (pairing_group / pairing_position).
 * Players remain in event_entries; ManCo can rebuild groups from scratch.
 */
export async function clearJointEventPairings(eventId: string): Promise<void> {
  if (!eventId?.trim()) throw new Error("clearJointEventPairings: missing eventId");

  const { error: rpcError } = await supabase.rpc("clear_joint_event_pairings", {
    p_event_id: eventId,
  });
  if (!rpcError) return;

  console.warn(
    "[jointEventRepo] clear_joint_event_pairings RPC failed, trying direct update:",
    rpcError.message,
  );
  const { error } = await supabase
    .from("event_entries")
    .update({ pairing_group: null, pairing_position: null })
    .eq("event_id", eventId);
  if (error) {
    console.error("[jointEventRepo] clearJointEventPairings failed:", error);
    throw new Error(error.message || "Failed to clear joint tee sheet pairings");
  }
}

/**
 * Sync event_entries for a joint event to match the given player IDs (playable source of truth for joint events).
 * **Dual members:** `playerIds` must list every participating-society member id (`expandJointRepresentativesToParticipatingMemberIds`).
 * Removes entries not in the list; adds entries for new players and creates
 * event_entry_society_eligibility for the member's society when in participating list.
 * Call from the Players screen when saving a joint event.
 */
export async function syncJointEventEntries(
  eventId: string,
  playerIds: string[],
  participatingSocietyIds: string[]
): Promise<void> {
  if (!eventId?.trim()) throw new Error("syncJointEventEntries: missing eventId");
  const ids = Array.isArray(playerIds) ? playerIds.filter((id) => id?.trim()) : [];

  const { data: existing } = await supabase
    .from("event_entries")
    .select("id, player_id")
    .eq("event_id", eventId);
  const existingList = (existing ?? []) as { id: string; player_id: string }[];
  const existingPlayerIds = new Set(existingList.map((r) => r.player_id));
  const targetSet = new Set(ids);

  for (const row of existingList) {
    if (!targetSet.has(row.player_id)) {
      const { error: delErr } = await supabase
        .from("event_entries")
        .delete()
        .eq("id", row.id);
      if (delErr) {
        console.error("[jointEventRepo] syncJointEventEntries delete failed:", row.id, delErr);
        throw new Error(delErr.message || "Failed to remove player from event");
      }
    }
  }

  const societySet = new Set(participatingSocietyIds.filter(Boolean));
  for (const playerId of ids) {
    if (existingPlayerIds.has(playerId)) continue;
    const { data: ins, error: insErr } = await supabase
      .from("event_entries")
      .insert({ event_id: eventId, player_id: playerId, status: "confirmed" })
      .select("id")
      .single();
    if (insErr) {
      console.error("[jointEventRepo] syncJointEventEntries insert failed:", playerId, insErr);
      throw new Error(insErr.message || "Failed to add player to event");
    }
    const entryId = (ins as { id: string })?.id;
    if (!entryId) continue;
    const { data: memberRow } = await supabase
      .from("members")
      .select("society_id")
      .eq("id", playerId)
      .maybeSingle();
    const memberSocietyId = (memberRow as { society_id?: string } | null)?.society_id;
    if (memberSocietyId && societySet.has(memberSocietyId)) {
      await supabase.from("event_entry_society_eligibility").insert({
        event_entry_id: entryId,
        society_id: memberSocietyId,
        is_eligible_for_society_results: true,
        is_eligible_for_society_oom: true,
      });
    }
    existingPlayerIds.add(playerId);
  }

  if (DEBUG) {
    console.log("[jointEventRepo] syncJointEventEntries: eventId", eventId, "synced", ids.length, "players");
  }
}

/**
 * Create a joint event. One master event row is created; for joint events we then
 * write event_societies. Standard events must not write event_societies.
 * If createEvent succeeds but upsertEventSocieties fails, we throw a clear error
 * (event already exists; partial state is visible in dev logs).
 */
export async function createJointEvent(
  input: JointEventCreateInput
): Promise<EventDoc> {
  const validationErrors = validateJointEventInput({
    is_joint_event: input.is_joint_event,
    host_society_id: input.host_society_id,
    participating_societies: input.participating_societies ?? [],
  });
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0].message);
  }

  const societyId = input.host_society_id;

  const event = await createEvent(societyId, {
    name: input.name,
    date: input.date,
    format: input.format as any,
    classification: input.classification as any,
    createdBy: input.createdBy,
    courseId: input.courseId,
    courseName: input.courseName,
    teeId: input.teeId,
    teeName: input.teeName,
    par: input.par,
    courseRating: input.courseRating,
    slopeRating: input.slopeRating,
    ladiesTeeName: input.ladiesTeeName,
    ladiesPar: input.ladiesPar,
    ladiesCourseRating: input.ladiesCourseRating,
    ladiesSlopeRating: input.ladiesSlopeRating,
    handicapAllowance: input.handicapAllowance,
    teeSource: input.teeSource,
    entryFeeDisplay: input.entryFeeDisplay,
  });

  if (input.is_joint_event && (input.participating_societies?.length ?? 0) >= 2) {
    try {
      if (DEBUG) {
        console.log("[jointEventRepo] createJointEvent: upserting societies", {
          eventId: event.id,
          count: input.participating_societies.length,
        });
      }
      await upsertEventSocieties(event.id, input.participating_societies);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save participating societies";
      if (DEBUG) {
        console.error("[jointEventRepo] createJointEvent: base event created but event_societies save failed. eventId:", event.id, "error:", msg);
      }
      throw new Error(
        "Event was created but participating societies could not be saved. " +
        "You can edit the event to add societies again."
      );
    }
  }

  return event;
}

/**
 * Update a joint event. One master event row; event_societies is updated only when
 * participating_societies is provided with 2+ societies. Do not silently downgrade
 * joint to standard; throw a clear error instead.
 */
export async function updateJointEvent(
  eventId: string,
  input: JointEventUpdateInput
): Promise<void> {
  const { updateEvent } = await import("@/lib/db_supabase/eventRepo");

  const societies = input.participating_societies;
  const explicitlyStandard = input.is_joint_event === false;

  if (explicitlyStandard) {
    throw new Error("Converting a joint event back to a standard event is not yet supported safely.");
  }

  if (societies && societies.length >= 2) {
    const validationErrors = validateJointEventInput({
      is_joint_event: true,
      host_society_id: input.host_society_id ?? societies.find((s) => s.role === "host")?.society_id ?? "",
      participating_societies: societies,
    });
    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0].message);
    }
  }

  await updateEvent(eventId, {
    name: input.name,
    date: input.date,
    courseId: input.courseId,
    courseName: input.courseName,
    teeId: input.teeId,
    format: input.format as any,
    classification: input.classification as any,
    teeName: input.teeName,
    par: input.par,
    courseRating: input.courseRating,
    slopeRating: input.slopeRating,
    handicapAllowance: input.handicapAllowance,
    ladiesTeeName: input.ladiesTeeName,
    ladiesPar: input.ladiesPar,
    ladiesCourseRating: input.ladiesCourseRating,
    ladiesSlopeRating: input.ladiesSlopeRating,
    teeSource: input.teeSource,
    entryFeeDisplay: input.entryFeeDisplay,
    rsvpDeadlineAt: input.rsvpDeadlineAt,
  });

  if (societies && societies.length >= 2) {
    await upsertEventSocieties(eventId, societies);
  }
}

function normalizeScope(obj: unknown): import("./jointEventTypes").JointEventLeaderboardScope {
  const o = (obj && typeof obj === "object") ? obj as Record<string, unknown> : {};
  return {
    scope_type: String(o.scope_type ?? "overall") as "overall" | "society",
    society_id: o.society_id != null ? String(o.society_id) : null,
    label: String(o.label ?? ""),
    has_oom: Boolean(o.has_oom),
  };
}
