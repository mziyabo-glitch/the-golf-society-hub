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

  console.log("[resultsRepo] upserting rows:", JSON.stringify(rows, null, 2));

  // Use .select() to verify rows were actually inserted/updated
  const { data, error } = await supabase
    .from("event_results")
    .upsert(rows, {
      onConflict: "event_id,member_id",
      ignoreDuplicates: false,
    })
    .select();

  if (error) {
    console.error("[resultsRepo] upsertEventResults failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Check for common RLS/permission errors
    if (error.code === "42501" || error.message?.includes("policy")) {
      throw new Error("Permission denied. Only Captain or Handicapper can save points.");
    }
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      throw new Error("Results table not found. Please contact support.");
    }

    throw new Error(error.message || "Failed to save event results");
  }

  // Verify data was actually saved (RLS can silently block without error)
  console.log("[resultsRepo] upsert returned:", data?.length ?? 0, "rows");

  if (!data || data.length === 0) {
    console.error("[resultsRepo] upsert returned no data - RLS may be blocking");
    throw new Error("Failed to save points. You may not have permission.");
  }

  if (data.length !== rows.length) {
    console.warn("[resultsRepo] Expected", rows.length, "rows but got", data.length);
  }

  console.log("[resultsRepo] upsertEventResults success, saved", data.length, "rows");
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
    // Return empty array if table doesn't exist yet (migration not run)
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[resultsRepo] event_results table does not exist yet - run migration");
      return [];
    }
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

  // First, get all event results for the society (separate query for reliability)
  const { data: resultsData, error: resultsError } = await supabase
    .from("event_results")
    .select("event_id, member_id, points")
    .eq("society_id", societyId);

  if (resultsError) {
    console.error("[resultsRepo] getOrderOfMeritTotals results query failed:", {
      message: resultsError.message,
      details: resultsError.details,
      hint: resultsError.hint,
      code: resultsError.code,
    });
    // Return empty array if table doesn't exist yet (migration not run)
    if (resultsError.code === "42P01" || resultsError.message?.includes("does not exist")) {
      console.warn("[resultsRepo] event_results table does not exist yet - run migration");
      return [];
    }
    throw new Error(resultsError.message || "Failed to get Order of Merit totals");
  }

  if (!resultsData || resultsData.length === 0) {
    console.log("[resultsRepo] No results found");
    return [];
  }

  // Get unique event IDs and member IDs
  const eventIds = [...new Set(resultsData.map((r) => r.event_id))];
  const memberIds = [...new Set(resultsData.map((r) => r.member_id))];

  // Fetch events to filter OOM only
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("id, classification, is_oom")
    .in("id", eventIds);

  if (eventsError) {
    console.error("[resultsRepo] events query failed:", eventsError);
    throw new Error(eventsError.message || "Failed to get events");
  }

  // Fetch members for names
  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select("id, name")
    .in("id", memberIds);

  if (membersError) {
    console.error("[resultsRepo] members query failed:", membersError);
    throw new Error(membersError.message || "Failed to get members");
  }

  // Build lookup maps
  const eventsMap = new Map((eventsData ?? []).map((e) => [e.id, e]));
  const membersMap = new Map((membersData ?? []).map((m) => [m.id, m]));

  console.log("[resultsRepo] raw results:", resultsData.length, "rows");

  // Filter to only OOM events and aggregate by member
  const memberTotals: Record<string, OrderOfMeritEntry> = {};

  resultsData.forEach((row) => {
    const event = eventsMap.get(row.event_id);
    if (!event) return;

    // Check if this is an OOM event
    const isOOM = event.classification === "oom" || event.is_oom === true;
    if (!isOOM) return;

    const memberId = row.member_id;
    const member = membersMap.get(memberId);
    const memberName = member?.name || "Unknown";
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
