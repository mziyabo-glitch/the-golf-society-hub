// lib/db_supabase/resultsRepo.ts
import { supabase } from "@/lib/supabase";

export type EventResultDoc = {
  id: string;
  society_id: string;
  event_id: string;
  member_id: string;
  points: number;
  created_at: string;
  updated_at: string;
};

export type EventResultInput = {
  member_id: string;
  points: number;
};

export type OrderOfMeritEntry = {
  memberId: string;
  memberName: string;
  totalPoints: number;
  eventsPlayed: number;
  rank: number;
};

/**
 * Upsert event results for an event
 * Creates or updates result rows for the given event and members
 */
export async function upsertEventResults(
  eventId: string,
  societyId: string,
  results: EventResultInput[]
): Promise<void> {
  console.log("[resultsRepo] upsertEventResults:", {
    eventId,
    societyId,
    resultCount: results.length,
  });

  if (!eventId || !societyId) {
    throw new Error("Missing eventId or societyId");
  }

  if (results.length === 0) {
    console.log("[resultsRepo] No results to upsert");
    return;
  }

  // Prepare rows for upsert
  const rows = results.map((r) => ({
    event_id: eventId,
    society_id: societyId,
    member_id: r.member_id,
    points: r.points,
  }));

  console.log("[resultsRepo] upserting rows:", rows);

  const { error } = await supabase
    .from("event_results")
    .upsert(rows, {
      onConflict: "event_id,member_id",
      ignoreDuplicates: false,
    });

  if (error) {
    console.error("[resultsRepo] upsertEventResults failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to save event results");
  }

  console.log("[resultsRepo] upsertEventResults success");
}

/**
 * Get results for a specific event
 */
export async function getEventResults(eventId: string): Promise<EventResultDoc[]> {
  console.log("[resultsRepo] getEventResults:", eventId);

  const { data, error } = await supabase
    .from("event_results")
    .select("*")
    .eq("event_id", eventId);

  if (error) {
    console.error("[resultsRepo] getEventResults failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get event results");
  }

  console.log("[resultsRepo] getEventResults returned:", data?.length ?? 0, "rows");
  return data ?? [];
}

/**
 * Get Order of Merit totals for a society
 * Aggregates points across all OOM events
 */
export async function getOrderOfMeritTotals(
  societyId: string
): Promise<OrderOfMeritEntry[]> {
  console.log("[resultsRepo] getOrderOfMeritTotals:", societyId);

  if (!societyId) {
    throw new Error("Missing societyId");
  }

  // Get all event results for the society, joining with members for names
  // and events to filter OOM events only
  const { data, error } = await supabase
    .from("event_results")
    .select(`
      member_id,
      points,
      events!inner (
        id,
        classification,
        is_oom
      ),
      members!inner (
        id,
        name
      )
    `)
    .eq("society_id", societyId);

  if (error) {
    console.error("[resultsRepo] getOrderOfMeritTotals failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get Order of Merit totals");
  }

  console.log("[resultsRepo] raw results:", data?.length ?? 0, "rows");

  // Filter to only OOM events and aggregate by member
  const memberTotals: Record<string, OrderOfMeritEntry> = {};

  (data ?? []).forEach((row: any) => {
    // Check if this is an OOM event
    const isOOM =
      row.events?.classification === "oom" || row.events?.is_oom === true;

    if (!isOOM) return;

    const memberId = row.member_id;
    const memberName = row.members?.name || "Unknown";
    const points = row.points || 0;

    if (!memberTotals[memberId]) {
      memberTotals[memberId] = {
        memberId,
        memberName,
        totalPoints: 0,
        eventsPlayed: 0,
        rank: 0, // Will be computed after sorting
      };
    }

    memberTotals[memberId].totalPoints += points;
    memberTotals[memberId].eventsPlayed += 1;
  });

  // Sort by total points descending
  const sorted = Object.values(memberTotals)
    .filter((entry) => entry.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);

  // Assign ranks with tie-handling (same points = same rank)
  // e.g., 1, 1, 3, 4, 4, 6
  let currentRank = 1;
  const rankedEntries: OrderOfMeritEntry[] = sorted.map((entry, index) => {
    // If not first entry, check if points differ from previous
    if (index > 0 && entry.totalPoints < sorted[index - 1].totalPoints) {
      currentRank = index + 1;
    }
    return { ...entry, rank: currentRank };
  });

  console.log("[resultsRepo] getOrderOfMeritTotals returning:", rankedEntries.length, "entries");
  return rankedEntries;
}

/**
 * Delete all results for an event
 */
export async function deleteEventResults(eventId: string): Promise<void> {
  console.log("[resultsRepo] deleteEventResults:", eventId);

  const { error } = await supabase
    .from("event_results")
    .delete()
    .eq("event_id", eventId);

  if (error) {
    console.error("[resultsRepo] deleteEventResults failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to delete event results");
  }

  console.log("[resultsRepo] deleteEventResults success");
}
