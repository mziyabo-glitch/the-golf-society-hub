import { supabase } from "@/lib/supabase";
import { canonicalJointPersonKey } from "@/lib/jointPersonDedupe";
import {
  eligibleCompletedBirdiesEventIds,
  findNextUnplayedEligibleBirdiesEvent,
  type BirdiesLeagueEventScope,
} from "@/lib/birdiesLeague/eventEligibility";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { getEventsForSociety } from "@/lib/db_supabase/eventRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { dedupeEventResultsByMemberIdPreferLatest, type EventResultDoc } from "@/lib/db_supabase/resultsRepo";

export type BirdiesLeagueStatus = "active" | "completed";

export type BirdiesLeagueRow = {
  id: string;
  society_id: string;
  name: string;
  season_label: string | null;
  start_from_event_id: string | null;
  start_date: string | null;
  event_scope: BirdiesLeagueEventScope;
  status: BirdiesLeagueStatus;
  created_at: string;
};

export type BirdiesLeagueStandingRow = {
  rank: number;
  personKey: string;
  displayName: string;
  memberIds: string[];
  totalBirdies: number;
  eventsCounted: number;
};

function mapLeagueRow(row: Record<string, unknown>): BirdiesLeagueRow {
  return {
    id: String(row.id),
    society_id: String(row.society_id),
    name: String(row.name ?? "Birdies League"),
    season_label: row.season_label != null ? String(row.season_label) : null,
    start_from_event_id: row.start_from_event_id != null ? String(row.start_from_event_id) : null,
    start_date: row.start_date != null ? String(row.start_date) : null,
    event_scope: row.event_scope as BirdiesLeagueEventScope,
    status: row.status as BirdiesLeagueStatus,
    created_at: String(row.created_at ?? ""),
  };
}

export async function getActiveBirdiesLeague(societyId: string): Promise<BirdiesLeagueRow | null> {
  if (!societyId) return null;
  const { data, error } = await supabase
    .from("birdies_leagues")
    .select("*")
    .eq("society_id", societyId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[birdiesLeagueRepo] birdies_leagues table missing — run migrations");
      return null;
    }
    throw new Error(error.message || "Failed to load Birdies League");
  }
  return data ? mapLeagueRow(data as Record<string, unknown>) : null;
}

export type CreateBirdiesLeagueInput = {
  societyId: string;
  eventScope: BirdiesLeagueEventScope;
  seasonLabel?: string | null;
};

/**
 * Creates one active league per society. Start event = next unplayed event for the chosen scope.
 * Birdie totals always use official `event_results.birdie_count` (nullable treated as 0).
 */
export async function createBirdiesLeague(input: CreateBirdiesLeagueInput): Promise<BirdiesLeagueRow> {
  const { societyId, eventScope, seasonLabel } = input;
  if (!societyId) throw new Error("Missing societyId");

  const events = await getEventsForSociety(societyId);
  const startEvent = findNextUnplayedEligibleBirdiesEvent(events, eventScope);
  if (!startEvent) {
    throw new Error(
      "No upcoming unplayed event matches this scope. Add or uncomplete an event, or widen scope.",
    );
  }

  const payload = {
    society_id: societyId,
    name: "Birdies League",
    season_label: seasonLabel?.trim() ? seasonLabel.trim() : null,
    start_from_event_id: startEvent.id,
    start_date: new Date().toISOString(),
    event_scope: eventScope,
    status: "active" as const,
  };

  const { data, error } = await supabase.from("birdies_leagues").insert(payload).select("*").single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("An active Birdies League already exists for this society.");
    }
    throw new Error(error.message || "Failed to create Birdies League");
  }
  return mapLeagueRow(data as Record<string, unknown>);
}

function displayNameForMember(m: MemberDoc): string {
  return String(m.displayName || m.display_name || m.name || "Member").trim() || "Member";
}

function aggregateOfficialBirdiesPerPersonForEvent(
  rows: EventResultDoc[],
  membersMap: Map<string, MemberDoc>,
): Map<string, number> {
  const memberRows = rows.filter((r) => r.member_id != null && String(r.member_id).length > 0);
  const deduped = dedupeEventResultsByMemberIdPreferLatest(
    memberRows as Array<EventResultDoc & { member_id: string }>,
  );
  const byPerson = new Map<string, number>();
  for (const r of deduped) {
    const m = membersMap.get(String(r.member_id));
    if (!m) continue;
    const pk = canonicalJointPersonKey(m);
    const raw = r.birdie_count;
    const b = raw == null ? 0 : Math.max(0, Math.floor(Number(raw)));
    if (!Number.isFinite(b)) continue;
    byPerson.set(pk, Math.max(byPerson.get(pk) ?? 0, b));
  }
  return byPerson;
}

/**
 * Standings: members only (guest rows excluded). Uses `event_results.birdie_count` only.
 */
export async function getBirdiesLeagueStandings(
  societyId: string,
  league: BirdiesLeagueRow,
  eventsOverride?: EventDoc[],
): Promise<BirdiesLeagueStandingRow[]> {
  if (!league.start_from_event_id) return [];

  const events = eventsOverride ?? (await getEventsForSociety(societyId));
  const startEvent = events.find((e) => e.id === league.start_from_event_id);
  if (!startEvent) return [];

  const eligibleIds = eligibleCompletedBirdiesEventIds(events, league.event_scope, startEvent);
  if (eligibleIds.length === 0) {
    return [];
  }

  const { data: resultRows, error } = await supabase
    .from("event_results")
    .select("id, event_id, member_id, event_guest_id, birdie_count, updated_at")
    .eq("society_id", societyId)
    .in("event_id", eligibleIds)
    .not("member_id", "is", null);

  if (error) {
    throw new Error(error.message || "Failed to load event results for Birdies League");
  }

  const members = await getMembersBySocietyId(societyId);
  const membersMap = new Map(members.map((m) => [m.id, m]));

  const byEvent = new Map<string, EventResultDoc[]>();
  for (const raw of resultRows ?? []) {
    const r = raw as EventResultDoc;
    if (r.event_guest_id != null && String(r.event_guest_id).length > 0) continue;
    const list = byEvent.get(r.event_id) ?? [];
    list.push(r);
    byEvent.set(r.event_id, list);
  }

  const totalBirdies = new Map<string, number>();
  const eventsPlayed = new Map<string, Set<string>>();

  for (const eventId of eligibleIds) {
    const perPerson = aggregateOfficialBirdiesPerPersonForEvent(byEvent.get(eventId) ?? [], membersMap);
    for (const [pk, b] of perPerson) {
      totalBirdies.set(pk, (totalBirdies.get(pk) ?? 0) + b);
      if (!eventsPlayed.has(pk)) eventsPlayed.set(pk, new Set());
      eventsPlayed.get(pk)!.add(eventId);
    }
  }

  const personKeys = new Set<string>([...totalBirdies.keys(), ...eventsPlayed.keys()]);
  const displayByPerson = new Map<string, { name: string; memberIds: string[] }>();

  for (const m of members) {
    const pk = canonicalJointPersonKey(m);
    const name = displayNameForMember(m);
    const prev = displayByPerson.get(pk);
    if (!prev) {
      displayByPerson.set(pk, { name, memberIds: [m.id] });
    } else {
      prev.memberIds.push(m.id);
      if (name.localeCompare(prev.name) < 0) prev.name = name;
    }
  }

  const rows: BirdiesLeagueStandingRow[] = [...personKeys].map((personKey) => {
    const meta = displayByPerson.get(personKey);
    return {
      rank: 0,
      personKey,
      displayName: meta?.name ?? "Member",
      memberIds: meta?.memberIds ?? [],
      totalBirdies: totalBirdies.get(personKey) ?? 0,
      eventsCounted: eventsPlayed.get(personKey)?.size ?? 0,
    };
  });

  rows.sort((a, b) => {
    if (b.totalBirdies !== a.totalBirdies) return b.totalBirdies - a.totalBirdies;
    if (b.eventsCounted !== a.eventsCounted) return b.eventsCounted - a.eventsCounted;
    return a.displayName.localeCompare(b.displayName);
  });

  let rank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i].totalBirdies < rows[i - 1].totalBirdies) {
      rank = i + 1;
    }
    rows[i].rank = rank;
  }

  return rows.filter((r) => r.eventsCounted > 0);
}

/** Resolve start event label for UI (from cached events list). */
export function describeBirdiesLeagueStart(
  league: BirdiesLeagueRow,
  events: EventDoc[],
): { title: string; subtitle: string | null } | null {
  if (!league.start_from_event_id) return null;
  const ev = events.find((e) => e.id === league.start_from_event_id);
  if (!ev) {
    return { title: "Scheduled event", subtitle: league.start_from_event_id };
  }
  const date = ev.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(ev.date.trim()) ? ev.date.trim() : null;
  return {
    title: ev.name?.trim() || "Event",
    subtitle: date,
  };
}

export function scopeLabel(scope: BirdiesLeagueEventScope): string {
  return scope === "oom_only" ? "Order of Merit events only" : "All official events (excludes friendlies)";
}

/** For home: rank / total for the signed-in member (joint-safe person key). */
export function pickBirdiesStandingForMember(
  standings: BirdiesLeagueStandingRow[],
  memberId: string | undefined,
  members: MemberDoc[],
): { rank: number; totalBirdies: number; eventsCounted: number } | null {
  if (!memberId) return null;
  const self = members.find((m) => m.id === memberId);
  if (!self) return null;
  const pk = canonicalJointPersonKey(self);
  const hit = standings.find((s) => s.personKey === pk);
  if (!hit) return null;
  return { rank: hit.rank, totalBirdies: hit.totalBirdies, eventsCounted: hit.eventsCounted };
}
