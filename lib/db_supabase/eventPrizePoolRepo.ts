// lib/db_supabase/eventPrizePoolRepo.ts
// Prize pool persistence and calculation orchestration (society / joint event scoped).

import { supabase } from "@/lib/supabase";
import { getEvent, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { getEventResults, type EventResultDoc } from "@/lib/db_supabase/resultsRepo";
import { getMembersByIds } from "@/lib/db_supabase/memberRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import { confirmedPrizePoolEntryHasOfficialScoredResult } from "@/lib/prizePoolOfficialResultGate";
import { getSession } from "@/lib/auth_supabase";
import {
  EVENT_PRIZE_POOL_ENTRY_COLUMNS,
  type CreateEventPrizePoolInput,
  type EventDivisionRow,
  type EventPrizePoolEntryRow,
  type EventPrizePoolResultRow,
  type EventPrizePoolRuleRow,
  type EventPrizePoolRow,
  type EventPrizePoolSplitterScoreRow,
  type PrizePoolCalculationResultRow,
  type PrizePoolEntrant,
  type PrizePoolRuleInput,
  type UpdateEventPrizePoolPatch,
} from "@/lib/event-prize-pools-types";
import {
  allocateDivisionPotPence,
  derivePrizePoolTotalAmountPence,
  allocateSplitterPotPence,
  filterEligiblePrizePoolEntrants,
  isPrizePoolSupportedEventFormat,
  PRIZE_POOL_UNSUPPORTED_FORMAT_MESSAGE,
  prizePoolSortOrderForEventFormat,
  resolveDivisionForHandicap,
  splitPotEvenlyAcrossDivisions,
  validateRuleBasisPointsTotal,
} from "@/lib/event-prize-pools-calc";

export const PRIZE_POOL_ERR_NO_RESULTS = "No official event results were found for this pool.";
export const PRIZE_POOL_ERR_RULES_SUM = "Payout percentages must total 100%.";
export const PRIZE_POOL_ERR_RULES_COUNT = "Payout rules must match places paid.";
export const PRIZE_POOL_ERR_NO_DIVISIONS = "This pool requires event divisions, but none were found.";
export const PRIZE_POOL_ERR_NO_ELIGIBLE = "No eligible players matched the pool rules.";
export const PRIZE_POOL_ERR_SPLITTER_DETAIL_REQUIRED =
  "Prize Pool (Pot) Splitter requires Front 9, Back 9, and Birdies for each confirmed entrant.";
/** Shown when the DB has not applied the migration that creates `event_prize_pool_splitter_scores`. */
export const PRIZE_POOL_ERR_SPLITTER_TABLE_SCHEMA =
  "The prize pool splitter table is not available on this database. Ask an admin to apply the latest Supabase migrations (including event_prize_pool_splitter_scores), then try again.";
export const PRIZE_POOL_ERR_FINALISED = "Finalised pools can no longer be edited.";
export const PRIZE_POOL_ERR_SUM_MISMATCH =
  "Payout allocation did not match the event pool total. Please try again.";

function sortRules(rows: EventPrizePoolRuleRow[]): EventPrizePoolRuleRow[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

function isMissingSplitterScoresTableError(error: { message?: string | null; code?: string | null }): boolean {
  const msg = String(error.message ?? "");
  if (!msg.includes("event_prize_pool_splitter_scores")) return false;
  return (
    msg.includes("schema cache") ||
    msg.includes("Could not find the") ||
    msg.includes("does not exist") ||
    msg.includes("Not found") ||
    error.code === "42P01"
  );
}

export type ListEventPrizePoolSplitterScoresResult = {
  rows: EventPrizePoolSplitterScoreRow[];
  /** PostgREST / schema cache: table missing until migrations are applied. */
  tableMissingInSchema: boolean;
};

export async function listEventDivisions(eventId: string): Promise<EventDivisionRow[]> {
  const { data, error } = await supabase
    .from("event_divisions")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[eventPrizePoolRepo] listEventDivisions:", error.message);
    throw new Error(error.message || "Failed to load divisions");
  }
  return (data ?? []) as EventDivisionRow[];
}

export async function createEventDivision(input: {
  eventId: string;
  name: string;
  sortOrder?: number;
  minHandicap?: number | null;
  maxHandicap?: number | null;
}): Promise<EventDivisionRow> {
  const { data, error } = await supabase
    .from("event_divisions")
    .insert({
      event_id: input.eventId,
      name: input.name.trim(),
      sort_order: input.sortOrder ?? 0,
      min_handicap: input.minHandicap ?? null,
      max_handicap: input.maxHandicap ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[eventPrizePoolRepo] createEventDivision:", error.message);
    throw new Error(error.message || "Failed to create division");
  }
  return data as EventDivisionRow;
}

export async function deleteEventDivision(divisionId: string): Promise<void> {
  const { error } = await supabase.from("event_divisions").delete().eq("id", divisionId);
  if (error) {
    console.error("[eventPrizePoolRepo] deleteEventDivision:", error.message);
    throw new Error(error.message || "Failed to delete division");
  }
}

export async function listEventPrizePools(eventId: string): Promise<EventPrizePoolRow[]> {
  const { data, error } = await supabase
    .from("event_prize_pools")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[eventPrizePoolRepo] listEventPrizePools:", error.message);
    throw new Error(error.message || "Failed to load prize pools");
  }
  return (data ?? []) as EventPrizePoolRow[];
}

export async function getEventPrizePool(poolId: string): Promise<EventPrizePoolRow | null> {
  const { data, error } = await supabase.from("event_prize_pools").select("*").eq("id", poolId).maybeSingle();
  if (error) {
    console.error("[eventPrizePoolRepo] getEventPrizePool:", error.message);
    throw new Error(error.message || "Failed to load prize pool");
  }
  return (data as EventPrizePoolRow) ?? null;
}

export async function getEventPrizePoolRules(poolId: string): Promise<EventPrizePoolRuleRow[]> {
  const { data, error } = await supabase
    .from("event_prize_pool_rules")
    .select("*")
    .eq("pool_id", poolId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[eventPrizePoolRepo] getEventPrizePoolRules:", error.message);
    throw new Error(error.message || "Failed to load payout rules");
  }
  return (data ?? []) as EventPrizePoolRuleRow[];
}

export async function listEventPrizePoolResults(poolId: string): Promise<EventPrizePoolResultRow[]> {
  const { data, error } = await supabase
    .from("event_prize_pool_results")
    .select("*")
    .eq("pool_id", poolId)
    .order("division_name", { ascending: true, nullsFirst: false })
    .order("finishing_position", { ascending: true })
    .order("payout_amount_pence", { ascending: false });

  if (error) {
    console.error("[eventPrizePoolRepo] listEventPrizePoolResults:", error.message);
    throw new Error(error.message || "Failed to load payout summary");
  }
  return (data ?? []) as EventPrizePoolResultRow[];
}

export async function getEventPrizePoolWithRules(poolId: string): Promise<{
  pool: EventPrizePoolRow;
  rules: EventPrizePoolRuleRow[];
} | null> {
  const pool = await getEventPrizePool(poolId);
  if (!pool) return null;
  const rules = await getEventPrizePoolRules(poolId);
  return { pool, rules: sortRules(rules) };
}

async function clearPoolResultsAndDraft(poolId: string): Promise<void> {
  const { error: delErr } = await supabase.from("event_prize_pool_results").delete().eq("pool_id", poolId);
  if (delErr) {
    console.error("[eventPrizePoolRepo] clear results:", delErr.message);
    throw new Error(delErr.message || "Failed to clear previous payout summary");
  }
  const { error: upErr } = await supabase
    .from("event_prize_pools")
    .update({ status: "draft", last_calculated_at: null })
    .eq("id", poolId);
  if (upErr) {
    console.error("[eventPrizePoolRepo] revert draft:", upErr.message);
    throw new Error(upErr.message || "Failed to update pool status");
  }
}

async function listPotMasterConfirmedPrizePoolEntries(poolId: string): Promise<EventPrizePoolEntryRow[]> {
  const { data, error } = await supabase
    .from("event_prize_pool_entries")
    .select(EVENT_PRIZE_POOL_ENTRY_COLUMNS)
    .eq("pool_id", poolId)
    .eq("confirmed_by_pot_master", true);

  if (error) {
    console.error("[eventPrizePoolRepo] listPotMasterConfirmedPrizePoolEntries:", error.message);
    throw new Error(error.message || "Failed to load prize pool entrants");
  }
  return (data ?? []) as EventPrizePoolEntryRow[];
}

export async function getPotMasterConfirmedPrizePoolEntrantCount(poolId: string): Promise<number> {
  const rows = await listPotMasterConfirmedPrizePoolEntries(poolId);
  return rows.length;
}

/**
 * Confirmed entrant count for Home / any linked-society member.
 * Uses RPC so counts are correct under RLS (members cannot SELECT other entrants' rows).
 */
export async function getConfirmedPrizePoolEntrantCountForDisplay(poolId: string): Promise<number> {
  const { data, error } = await supabase.rpc("count_confirmed_prize_pool_entrants", {
    p_pool_id: poolId,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] count_confirmed_prize_pool_entrants:", error.message);
    return getPotMasterConfirmedPrizePoolEntrantCount(poolId);
  }
  const n = typeof data === "number" ? data : Number.parseInt(String(data ?? "0"), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export async function listEventPrizePoolSplitterScores(
  poolId: string,
): Promise<ListEventPrizePoolSplitterScoresResult> {
  const { data, error } = await supabase
    .from("event_prize_pool_splitter_scores")
    .select("*")
    .eq("pool_id", poolId)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingSplitterScoresTableError(error)) {
      console.warn(
        "[eventPrizePoolRepo] listEventPrizePoolSplitterScores: splitter scores table missing from schema; continuing with no saved rows.",
      );
      return { rows: [], tableMissingInSchema: true };
    }
    console.error("[eventPrizePoolRepo] listEventPrizePoolSplitterScores:", error.message);
    throw new Error(error.message || "Failed to load splitter scores.");
  }
  return { rows: (data ?? []) as EventPrizePoolSplitterScoreRow[], tableMissingInSchema: false };
}

export async function replaceEventPrizePoolSplitterScores(
  poolId: string,
  eventId: string,
  rows: Array<{
    memberId: string | null;
    guestId: string | null;
    front9Score: number;
    back9Score: number;
    birdies: number;
  }>,
): Promise<void> {
  const existing = await getEventPrizePool(poolId);
  if (!existing) throw new Error("Prize pool not found.");
  if (existing.status === "finalised") throw new Error(PRIZE_POOL_ERR_FINALISED);

  const cleanRows = rows
    .map((r) => ({
      memberId: r.memberId ? String(r.memberId) : null,
      guestId: r.guestId ? String(r.guestId) : null,
      front9Score: Number(r.front9Score),
      back9Score: Number(r.back9Score),
      birdies: Number(r.birdies),
    }))
    .filter((r) => (r.memberId ? !r.guestId : !!r.guestId))
    .filter(
      (r) =>
        Number.isFinite(r.front9Score) &&
        Number.isFinite(r.back9Score) &&
        Number.isFinite(r.birdies) &&
        r.front9Score >= 0 &&
        r.back9Score >= 0 &&
        r.birdies >= 0,
    );

  const { error: delErr } = await supabase
    .from("event_prize_pool_splitter_scores")
    .delete()
    .eq("pool_id", poolId);
  if (delErr) {
    console.error("[eventPrizePoolRepo] replaceEventPrizePoolSplitterScores(delete):", delErr.message);
    if (isMissingSplitterScoresTableError(delErr)) {
      throw new Error(PRIZE_POOL_ERR_SPLITTER_TABLE_SCHEMA);
    }
    throw new Error(delErr.message || "Failed to reset splitter scores.");
  }

  if (cleanRows.length === 0) return;

  const payload = cleanRows.map((r) => ({
    pool_id: poolId,
    event_id: eventId,
    member_id: r.memberId,
    guest_id: r.guestId,
    front9_score: Math.round(r.front9Score),
    back9_score: Math.round(r.back9Score),
    birdies: Math.max(0, Math.round(r.birdies)),
  }));

  const { error: insErr } = await supabase.from("event_prize_pool_splitter_scores").insert(payload);
  if (insErr) {
    console.error("[eventPrizePoolRepo] replaceEventPrizePoolSplitterScores(insert):", insErr.message);
    if (isMissingSplitterScoresTableError(insErr)) {
      throw new Error(PRIZE_POOL_ERR_SPLITTER_TABLE_SCHEMA);
    }
    throw new Error(insErr.message || "Failed to save splitter scores.");
  }
}

async function buildPrizePoolEntrants(params: {
  pool: EventPrizePoolRow;
  event: EventDoc;
  divisions: EventDivisionRow[];
}): Promise<PrizePoolEntrant[]> {
  const { pool, event, divisions } = params;
  const results = await getEventResults(pool.event_id);
  const scored = results.filter((r) => r.day_value != null);
  if (scored.length === 0) return [];

  const societyScope = String(pool.host_society_id ?? event.society_id ?? "");

  const entries = await listPotMasterConfirmedPrizePoolEntries(pool.id);
  if (entries.length === 0) return [];

  const memberEntryIds = [...new Set(entries.map((e) => e.member_id).filter(Boolean).map(String))];
  const guestEntryIds = [...new Set(entries.map((e) => e.guest_id).filter(Boolean).map(String))];

  const [members, guests] = await Promise.all([
    memberEntryIds.length ? getMembersByIds(memberEntryIds) : Promise.resolve([]),
    guestEntryIds.length ? getEventGuests(pool.event_id) : Promise.resolve([]),
  ]);
  const membersById = new Map(members.map((m) => [m.id, m]));
  const guestsById = new Map(guests.map((g) => [g.id, g]));

  const resultByMemberId = new Map<string, EventResultDoc>();
  for (const r of scored) {
    if (r.member_id) resultByMemberId.set(String(r.member_id), r);
  }
  const resultByGuestKey = new Map<string, EventResultDoc>();
  for (const r of scored) {
    if (r.event_guest_id) {
      resultByGuestKey.set(`${r.society_id}:${r.event_guest_id}`, r);
    }
  }

  const fmtSort = prizePoolSortOrderForEventFormat(event.format);
  const entrants: PrizePoolEntrant[] = [];
  for (const en of entries) {
    if (en.participant_type === "member" && en.member_id) {
      if (!confirmedPrizePoolEntryHasOfficialScoredResult(en, resultByMemberId, resultByGuestKey, societyScope)) {
        continue;
      }
      const mid = String(en.member_id);
      const pick = resultByMemberId.get(mid)!;
      const m = membersById.get(mid);
      if (!m) continue;
      const dv = pick.day_value ?? 0;
      let divisionName: string | null = null;
      if (pool.payout_mode === "division") {
        divisionName = resolveDivisionForHandicap(m.handicap_index ?? m.handicapIndex ?? null, divisions);
      }
      entrants.push({
        participantKey: `member:${mid}`,
        memberId: mid,
        guestId: null,
        displayName: (en.participant_name || m.displayName || m.display_name || m.name || "Member").trim(),
        societyId: pick.society_id,
        registrationId: null,
        divisionName,
        dayValue: dv,
        front9Value: pick.front_9_value ?? null,
        back9Value: pick.back_9_value ?? null,
        birdieCount: pick.birdie_count ?? null,
        sortOrder: fmtSort,
      });
      continue;
    }

    if (en.participant_type === "guest" && en.guest_id) {
      if (!confirmedPrizePoolEntryHasOfficialScoredResult(en, resultByMemberId, resultByGuestKey, societyScope)) {
        continue;
      }
      const gid = String(en.guest_id);
      const pick = resultByGuestKey.get(`${societyScope}:${gid}`)!;
      const g = guestsById.get(gid);
      let divisionName: string | null = null;
      if (pool.payout_mode === "division") {
        divisionName = resolveDivisionForHandicap(g?.handicap_index ?? null, divisions);
      }
      const label = (en.participant_name || g?.name || "Guest").trim();
      entrants.push({
        participantKey: `guest:${gid}`,
        memberId: null,
        guestId: gid,
        displayName: label,
        societyId: societyScope || pick.society_id,
        registrationId: null,
        divisionName,
        dayValue: pick.day_value ?? 0,
        front9Value: pick.front_9_value ?? null,
        back9Value: pick.back_9_value ?? null,
        birdieCount: pick.birdie_count ?? null,
        sortOrder: fmtSort,
      });
    }
  }

  return entrants;
}

export async function createEventPrizePool(
  input: CreateEventPrizePoolInput,
  createdBy: string | null,
): Promise<EventPrizePoolRow> {
  const v = validateRuleBasisPointsTotal(input.rules);
  if (!v.ok) throw new Error(PRIZE_POOL_ERR_RULES_SUM);
  if (input.rules.length !== input.placesPaid) throw new Error(PRIZE_POOL_ERR_RULES_COUNT);

  let totalAmountPence = input.totalAmountPence;
  if (input.totalAmountMode === "per_entrant") {
    totalAmountPence = derivePrizePoolTotalAmountPence({
      totalAmountMode: "per_entrant",
      manualTotalAmountPence: input.totalAmountPence,
      potEntryValuePence: input.potEntryValuePence ?? null,
      confirmedEntrantCount: 0,
    });
  }

  const { data: poolRow, error: poolErr } = await supabase
    .from("event_prize_pools")
    .insert({
      event_id: input.eventId,
      host_society_id: input.hostSocietyId,
      name: input.name.trim(),
      competition_name: input.competitionName,
      competition_type: input.competitionType,
      description: input.description ?? null,
      total_amount_pence: totalAmountPence,
      total_amount_mode: input.totalAmountMode,
      pot_entry_value_pence: input.potEntryValuePence ?? null,
      birdie_fallback_to_overall: input.birdieFallbackToOverall,
      payout_mode: input.payoutMode,
      division_source: input.divisionSource,
      places_paid: input.placesPaid,
      include_guests: input.includeGuests,
      require_paid: false,
      require_confirmed: false,
      notes: input.notes ?? null,
      created_by: createdBy,
    })
    .select()
    .single();

  if (poolErr || !poolRow) {
    console.error("[eventPrizePoolRepo] create pool:", poolErr?.message);
    throw new Error(poolErr?.message || "Failed to create prize pool");
  }

  const pool = poolRow as EventPrizePoolRow;
  const rulesPayload = input.rules.map((r) => ({
    pool_id: pool.id,
    position: r.position,
    percentage_basis_points: r.percentage_basis_points,
  }));

  const { error: rulesErr } = await supabase.from("event_prize_pool_rules").insert(rulesPayload);
  if (rulesErr) {
    console.error("[eventPrizePoolRepo] create rules:", rulesErr.message);
    await supabase.from("event_prize_pools").delete().eq("id", pool.id);
    throw new Error(rulesErr.message || "Failed to save payout rules");
  }

  return pool;
}

export async function updateEventPrizePool(poolId: string, patch: UpdateEventPrizePoolPatch): Promise<void> {
  const existing = await getEventPrizePool(poolId);
  if (!existing) throw new Error("Prize pool not found.");
  if (existing.status === "finalised") throw new Error(PRIZE_POOL_ERR_FINALISED);

  const configKeys = [
    "name",
    "competitionName",
    "competitionType",
    "description",
    "totalAmountPence",
    "totalAmountMode",
    "potEntryValuePence",
    "birdieFallbackToOverall",
    "payoutMode",
    "divisionSource",
    "placesPaid",
    "includeGuests",
    "requirePaid",
    "requireConfirmed",
    "notes",
  ] as const;
  const touchesConfig = configKeys.some((k) => patch[k as keyof UpdateEventPrizePoolPatch] !== undefined);

  if (touchesConfig && existing.status === "calculated") {
    await clearPoolResultsAndDraft(poolId);
  }

  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.competitionName !== undefined) payload.competition_name = patch.competitionName;
  if (patch.competitionType !== undefined) payload.competition_type = patch.competitionType;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.totalAmountPence !== undefined) payload.total_amount_pence = patch.totalAmountPence;
  if (patch.totalAmountMode !== undefined) payload.total_amount_mode = patch.totalAmountMode;
  if (patch.potEntryValuePence !== undefined) payload.pot_entry_value_pence = patch.potEntryValuePence;
  if (patch.birdieFallbackToOverall !== undefined) {
    payload.birdie_fallback_to_overall = patch.birdieFallbackToOverall;
  }
  if (patch.payoutMode !== undefined) payload.payout_mode = patch.payoutMode;
  if (patch.divisionSource !== undefined) payload.division_source = patch.divisionSource;
  if (patch.placesPaid !== undefined) payload.places_paid = patch.placesPaid;
  if (patch.includeGuests !== undefined) payload.include_guests = patch.includeGuests;
  if (patch.requirePaid !== undefined) payload.require_paid = patch.requirePaid;
  if (patch.requireConfirmed !== undefined) payload.require_confirmed = patch.requireConfirmed;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  const nextMode = patch.totalAmountMode ?? existing.total_amount_mode;
  const nextPotEntryValue = patch.potEntryValuePence ?? existing.pot_entry_value_pence;
  if (nextMode === "per_entrant") {
    const confirmedCount = await getPotMasterConfirmedPrizePoolEntrantCount(poolId);
    payload.total_amount_pence = derivePrizePoolTotalAmountPence({
      totalAmountMode: "per_entrant",
      manualTotalAmountPence: existing.total_amount_pence,
      potEntryValuePence: nextPotEntryValue ?? null,
      confirmedEntrantCount: confirmedCount,
    });
  }

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("event_prize_pools").update(payload).eq("id", poolId);
  if (error) {
    console.error("[eventPrizePoolRepo] update:", error.message);
    throw new Error(error.message || "Failed to update prize pool");
  }
}

export async function replaceEventPrizePoolRules(poolId: string, rules: PrizePoolRuleInput[]): Promise<void> {
  const existing = await getEventPrizePool(poolId);
  if (!existing) throw new Error("Prize pool not found.");
  if (existing.status === "finalised") throw new Error(PRIZE_POOL_ERR_FINALISED);

  const v = validateRuleBasisPointsTotal(rules);
  if (!v.ok) throw new Error(PRIZE_POOL_ERR_RULES_SUM);
  if (rules.length !== existing.places_paid) throw new Error(PRIZE_POOL_ERR_RULES_COUNT);

  if (existing.status === "calculated") {
    await clearPoolResultsAndDraft(poolId);
  }

  const { error: delErr } = await supabase.from("event_prize_pool_rules").delete().eq("pool_id", poolId);
  if (delErr) {
    console.error("[eventPrizePoolRepo] delete rules:", delErr.message);
    throw new Error(delErr.message || "Failed to replace payout rules");
  }

  const payload = rules.map((r) => ({
    pool_id: poolId,
    position: r.position,
    percentage_basis_points: r.percentage_basis_points,
  }));
  const { error: insErr } = await supabase.from("event_prize_pool_rules").insert(payload);
  if (insErr) {
    console.error("[eventPrizePoolRepo] insert rules:", insErr.message);
    throw new Error(insErr.message || "Failed to save payout rules");
  }
}

export async function deleteEventPrizePool(poolId: string): Promise<void> {
  const existing = await getEventPrizePool(poolId);
  if (!existing) return;
  if (existing.status === "finalised") throw new Error("Finalised pools cannot be deleted.");

  const { error } = await supabase.rpc("delete_event_prize_pool", { p_pool_id: poolId });
  if (error) {
    console.error("[eventPrizePoolRepo] delete_event_prize_pool:", error.message);
    throw new Error(error.message || "Failed to delete prize pool");
  }
}

export async function calculateEventPrizePool(poolId: string): Promise<void> {
  const full = await getEventPrizePoolWithRules(poolId);
  if (!full) throw new Error("Prize pool not found.");
  const { pool, rules } = full;
  if (pool.status === "finalised") throw new Error(PRIZE_POOL_ERR_FINALISED);

  const event = await getEvent(pool.event_id);
  if (!event) throw new Error("Event not found.");

  if (!isPrizePoolSupportedEventFormat(event.format)) {
    throw new Error(PRIZE_POOL_UNSUPPORTED_FORMAT_MESSAGE);
  }

  if (pool.competition_type !== "splitter") {
    const v = validateRuleBasisPointsTotal(rules);
    if (!v.ok) throw new Error(PRIZE_POOL_ERR_RULES_SUM);
    if (rules.length !== pool.places_paid) throw new Error(PRIZE_POOL_ERR_RULES_COUNT);
  }

  const sortOrder = prizePoolSortOrderForEventFormat(event.format);
  const divisions =
    pool.payout_mode === "division" ? await listEventDivisions(pool.event_id) : [];

  if (pool.payout_mode === "division" && divisions.length === 0) {
    throw new Error(PRIZE_POOL_ERR_NO_DIVISIONS);
  }

  const rawResults = await getEventResults(pool.event_id);
  if (rawResults.filter((r) => r.day_value != null).length === 0) {
    throw new Error(PRIZE_POOL_ERR_NO_RESULTS);
  }
  const confirmedEntrants = await listPotMasterConfirmedPrizePoolEntries(poolId);
  const effectiveTotalPence = derivePrizePoolTotalAmountPence({
    totalAmountMode: pool.total_amount_mode,
    manualTotalAmountPence: pool.total_amount_pence,
    potEntryValuePence: pool.pot_entry_value_pence,
    confirmedEntrantCount: confirmedEntrants.length,
  });

  const entrants = await buildPrizePoolEntrants({ pool, event, divisions });
  const filtered = filterEligiblePrizePoolEntrants(pool, entrants);
  if (filtered.length === 0) throw new Error(PRIZE_POOL_ERR_NO_ELIGIBLE);

  let resultRows: PrizePoolCalculationResultRow[] = [];
  if (pool.competition_type === "splitter") {
    const { rows: splitterRows, tableMissingInSchema } = await listEventPrizePoolSplitterScores(poolId);
    if (tableMissingInSchema) {
      throw new Error(PRIZE_POOL_ERR_SPLITTER_TABLE_SCHEMA);
    }
    const splitterByParticipantKey = new Map<string, EventPrizePoolSplitterScoreRow>();
    for (const row of splitterRows) {
      if (row.member_id) {
        splitterByParticipantKey.set(`member:${String(row.member_id)}`, row);
      } else if (row.guest_id) {
        splitterByParticipantKey.set(`guest:${String(row.guest_id)}`, row);
      }
    }
    const entrantsWithSplitter = filtered.map((entrant) => {
      const split = splitterByParticipantKey.get(entrant.participantKey);
      return {
        ...entrant,
        front9Value: split ? Number(split.front9_score) : null,
        back9Value: split ? Number(split.back9_score) : null,
        birdieCount: split ? Number(split.birdies) : null,
      };
    });
    if (
      entrantsWithSplitter.some(
        (e) =>
          e.front9Value == null ||
          Number.isNaN(Number(e.front9Value)) ||
          e.back9Value == null ||
          Number.isNaN(Number(e.back9Value)) ||
          e.birdieCount == null ||
          Number.isNaN(Number(e.birdieCount)),
      )
    ) {
      throw new Error(PRIZE_POOL_ERR_SPLITTER_DETAIL_REQUIRED);
    }
    resultRows = allocateSplitterPotPence({
      entrants: entrantsWithSplitter,
      totalPotPence: effectiveTotalPence,
      eventFormat: String(event.format),
      birdieFallbackToOverall: pool.birdie_fallback_to_overall,
    });
  } else {
    const rulesBps = sortRules(rules).map((r) => r.percentage_basis_points);
    if (pool.payout_mode === "overall") {
      resultRows = allocateDivisionPotPence({
        entrants: filtered,
        rulesBps,
        divisionPotPence: effectiveTotalPence,
        divisionName: null,
        eventFormat: String(event.format),
      });
    } else {
      const byDiv = new Map<string, PrizePoolEntrant[]>();
      for (const e of filtered) {
        const d = e.divisionName;
        if (!d) continue;
        if (!byDiv.has(d)) byDiv.set(d, []);
        byDiv.get(d)!.push(e);
      }

      const activeDivKeys = [...byDiv.keys()].sort((a, b) => {
        const da = divisions.find((x) => x.name === a);
        const db = divisions.find((x) => x.name === b);
        const sa = da?.sort_order ?? 0;
        const sb = db?.sort_order ?? 0;
        if (sa !== sb) return sa - sb;
        return a.localeCompare(b);
      });

      if (activeDivKeys.length === 0) throw new Error(PRIZE_POOL_ERR_NO_ELIGIBLE);

      const shares = splitPotEvenlyAcrossDivisions(effectiveTotalPence, activeDivKeys.length);
      activeDivKeys.forEach((divName, i) => {
        const chunk = byDiv.get(divName)!;
        const pot = shares[i] ?? 0;
        resultRows.push(
          ...allocateDivisionPotPence({
            entrants: chunk,
            rulesBps,
            divisionPotPence: pot,
            divisionName: divName,
            eventFormat: String(event.format),
          }),
        );
      });
    }
  }

  const sum = resultRows.reduce((a, r) => a + r.payoutAmountPence, 0);
  if (sum !== effectiveTotalPence) {
    console.error("[eventPrizePoolRepo] payout sum mismatch", { sum, expected: effectiveTotalPence });
    throw new Error(PRIZE_POOL_ERR_SUM_MISMATCH);
  }

  const { error: delErr } = await supabase.from("event_prize_pool_results").delete().eq("pool_id", poolId);
  if (delErr) {
    console.error("[eventPrizePoolRepo] delete old results:", delErr.message);
    throw new Error(delErr.message || "Failed to reset payout summary");
  }

  const inserts = resultRows.map((r) => ({
    pool_id: poolId,
    event_id: pool.event_id,
    member_id: r.memberId,
    event_guest_id: r.guestId,
    event_registration_id: r.eventRegistrationId,
    division_name: r.divisionName,
    finishing_position: r.finishingPosition,
    tie_size: r.tieSize,
    payout_amount_pence: r.payoutAmountPence,
    calculation_note: r.calculationNote,
    score_display: r.scoreDisplay,
  }));

  if (inserts.length > 0) {
    const { error: insErr } = await supabase.from("event_prize_pool_results").insert(inserts);
    if (insErr) {
      console.error("[eventPrizePoolRepo] insert results:", insErr.message);
      throw new Error(insErr.message || "Failed to save payout summary");
    }
  }

  const { error: upErr } = await supabase
    .from("event_prize_pools")
    .update({
      status: "calculated",
      total_amount_pence: effectiveTotalPence,
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", poolId);

  if (upErr) {
    console.error("[eventPrizePoolRepo] mark calculated:", upErr.message);
    throw new Error(upErr.message || "Failed to update pool status");
  }
}

export async function finaliseEventPrizePool(poolId: string): Promise<void> {
  const pool = await getEventPrizePool(poolId);
  if (!pool) throw new Error("Prize pool not found.");
  if (pool.status !== "calculated") throw new Error("Only calculated pools can be finalised.");

  const { data, error } = await supabase
    .from("event_prize_pools")
    .update({
      status: "finalised",
      finalised_at: new Date().toISOString(),
    })
    .eq("id", poolId)
    .eq("status", "calculated")
    .select("id");

  if (error) {
    console.error("[eventPrizePoolRepo] finalise:", error.message);
    throw new Error(error.message || "Failed to finalise pool");
  }
  if (!data?.length) {
    throw new Error("Pool could not be finalised. Refresh and try again.");
  }
}

// --- Prize pool opt-in, manager assignment, event settings (099) ---

export async function getEventPrizePoolManagerInfo(
  eventId: string,
): Promise<{ memberId: string; displayName: string } | null> {
  const { data, error } = await supabase
    .from("event_prize_pool_managers")
    .select("member_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[eventPrizePoolRepo] getEventPrizePoolManagerInfo:", error.message);
    return null;
  }
  if (!data?.member_id) return null;
  const mid = String(data.member_id);
  const mems = await getMembersByIds([mid]);
  const m = mems[0];
  const displayName = m
    ? (m.displayName || m.display_name || m.name || "Member").trim()
    : "Pot Master";
  return { memberId: mid, displayName };
}

export async function getMyPrizePoolEntry(
  poolId: string,
  memberId: string,
): Promise<EventPrizePoolEntryRow | null> {
  const { data, error } = await supabase
    .from("event_prize_pool_entries")
    .select(EVENT_PRIZE_POOL_ENTRY_COLUMNS)
    .eq("pool_id", poolId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    console.error("[eventPrizePoolRepo] getMyPrizePoolEntry:", error.message);
    return null;
  }
  return (data as EventPrizePoolEntryRow) ?? null;
}

export async function upsertMyPrizePoolOptIn(
  poolId: string,
  memberId: string,
  optedIn: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("upsert_my_prize_pool_entry", {
    p_pool_id: poolId,
    p_member_id: memberId,
    p_opted_in: optedIn,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] upsertMyPrizePoolOptIn:", error.message);
    throw new Error(error.message || "Could not update prize pool opt-in.");
  }
}

export async function listPrizePoolOptInEntrants(
  poolId: string,
): Promise<(EventPrizePoolEntryRow & { displayName: string })[]> {
  const { data, error } = await supabase
    .from("event_prize_pool_entries")
    .select(EVENT_PRIZE_POOL_ENTRY_COLUMNS)
    .eq("pool_id", poolId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[eventPrizePoolRepo] listPrizePoolOptInEntrants:", error.message);
    throw new Error(error.message || "Failed to load entrants.");
  }
  const rows = ((data ?? []) as EventPrizePoolEntryRow[]).filter(
    (r) => r.participant_type === "guest" || (r.participant_type === "member" && r.opted_in === true),
  );
  const memberIds = [...new Set(rows.map((r) => r.member_id).filter(Boolean).map(String))];
  const members = memberIds.length ? await getMembersByIds(memberIds) : [];
  const byId = new Map(
    members.map((m) => [m.id, (m.displayName || m.display_name || m.name || "Member").trim()]),
  );
  return rows.map((r) => {
    const displayName =
      r.participant_type === "guest"
        ? (r.participant_name || "Guest").trim()
        : (r.participant_name || byId.get(String(r.member_id)) || "Member").trim();
    return { ...r, displayName };
  });
}

export async function setPrizePoolEntryPotMasterConfirmation(
  entryId: string,
  confirmed: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_event_prize_pool_entry_pot_master_confirmation", {
    p_entry_id: entryId,
    p_confirmed: confirmed,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] setPrizePoolEntryPotMasterConfirmation:", error.message);
    throw new Error(error.message || "Could not update confirmation.");
  }
}

export async function insertPrizePoolGuestEntrant(poolId: string, guestId: string): Promise<string> {
  const { data, error } = await supabase.rpc("insert_event_prize_pool_guest_entrant", {
    p_pool_id: poolId,
    p_guest_id: guestId,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] insertPrizePoolGuestEntrant:", error.message);
    throw new Error(error.message || "Could not add guest entrant.");
  }
  if (data == null || String(data).length === 0) {
    throw new Error("Could not add guest entrant.");
  }
  return String(data);
}

/** Pot Master / ManCo: add a playing member who has not (or cannot) opt in via the app. */
export async function insertPrizePoolMemberEntrant(poolId: string, memberId: string): Promise<string> {
  const { data, error } = await supabase.rpc("insert_event_prize_pool_member_entrant", {
    p_pool_id: poolId,
    p_member_id: memberId,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] insertPrizePoolMemberEntrant:", error.message);
    throw new Error(error.message || "Could not add member to pool.");
  }
  if (data == null || String(data).length === 0) {
    throw new Error("Could not add member to pool.");
  }
  return String(data);
}

export async function deletePrizePoolEntry(entryId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_event_prize_pool_entry", {
    p_entry_id: entryId,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] deletePrizePoolEntry:", error.message);
    throw new Error(error.message || "Could not remove entrant.");
  }
}

export async function setEventPrizePoolEnabled(eventId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_event_prize_pool_enabled", {
    p_event_id: eventId,
    p_enabled: enabled,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] setEventPrizePoolEnabled:", error.message);
    throw new Error(error.message || "Could not update prize pool availability.");
  }
}

export async function setEventPrizePoolPaymentInstructions(
  eventId: string,
  instructions: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_event_prize_pool_payment_instructions", {
    p_event_id: eventId,
    p_instructions: instructions,
  });
  if (error) {
    console.error("[eventPrizePoolRepo] setEventPrizePoolPaymentInstructions:", error.message);
    throw new Error(error.message || "Could not save payment instructions.");
  }
}

export async function assignEventPrizePoolManager(eventId: string, managerMemberId: string): Promise<void> {
  const session = await getSession();
  const { error } = await supabase.from("event_prize_pool_managers").upsert(
    {
      event_id: eventId,
      member_id: managerMemberId,
      appointed_by: session?.user?.id ?? null,
    },
    { onConflict: "event_id" },
  );
  if (error) {
    console.error("[eventPrizePoolRepo] assignEventPrizePoolManager:", error.message);
    throw new Error(error.message || "Could not assign Pot Master.");
  }
}

export async function removeEventPrizePoolManager(eventId: string): Promise<void> {
  const { error } = await supabase.from("event_prize_pool_managers").delete().eq("event_id", eventId);
  if (error) {
    console.error("[eventPrizePoolRepo] removeEventPrizePoolManager:", error.message);
    throw new Error(error.message || "Could not remove Pot Master.");
  }
}

export async function isMemberTheEventPrizePoolManager(
  eventId: string,
  memberId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("event_prize_pool_managers")
    .select("member_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error || !data?.member_id) return false;
  return String(data.member_id) === String(memberId);
}

/** UK currency display for integer pence */
export function formatPenceGbp(pence: number): string {
  const pounds = pence / 100;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pounds);
}
