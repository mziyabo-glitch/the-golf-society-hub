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
  // Defensive check: ensure results is an array
  if (!Array.isArray(results)) {
    console.error("[resultsRepo] upsertEventResults: results is not an array!", {
      type: typeof results,
      value: results,
    });
    throw new Error("Invalid results: expected an array");
  }

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

    // PGRST204: Schema mismatch - column doesn't exist in PostgREST cache
    if (error.code === "PGRST204" || error.message?.includes("PGRST204") || error.message?.includes("schema cache")) {
      throw new Error(
        "Database schema mismatch (PGRST204). The event_results table may be missing the society_id column. " +
        "Please run migration 011 and refresh the API schema in Supabase Dashboard → Settings → API → Reload schema."
      );
    }

    // 42501: RLS permission denied
    if (error.code === "42501" || error.message?.includes("policy")) {
      throw new Error("Permission denied. Only Captain, Handicapper, or Secretary can save points.");
    }

    // 42P01: Table doesn't exist
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      throw new Error("Results table not found. Please run migration 011 in Supabase.");
    }

    // 23503: Foreign key violation
    if (error.code === "23503") {
      throw new Error("Invalid event or member reference. Please refresh and try again.");
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

  // Aggregate points by member (include all events, not just OOM)
  const memberTotals: Record<string, OrderOfMeritEntry> = {};

  resultsData.forEach((row) => {
    const event = eventsMap.get(row.event_id);
    if (!event) return;

    // Include ALL events with results (not just OOM classified)
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

/**
 * Results Log entry for audit trail view
 */
export type ResultsLogEntry = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  format: "stableford" | "medal" | string | null;
  memberId: string;
  memberName: string;
  points: number;
};

/**
 * Get Order of Merit results log (audit trail)
 * Returns raw event results grouped by event, for OOM events only
 */
export async function getOrderOfMeritLog(
  societyId: string
): Promise<ResultsLogEntry[]> {
  console.log("[resultsRepo] getOrderOfMeritLog:", societyId);

  if (!societyId) {
    throw new Error("Missing societyId");
  }

  // Fetch all events for this society with results, ordered by date desc
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("id, name, date, format, classification, is_oom")
    .eq("society_id", societyId)
    .order("date", { ascending: false });

  if (eventsError) {
    console.error("[resultsRepo] getOrderOfMeritLog events query failed:", eventsError);
    if (eventsError.code === "42P01") {
      return [];
    }
    throw new Error(eventsError.message || "Failed to get events");
  }

  if (!eventsData || eventsData.length === 0) {
    console.log("[resultsRepo] No events found");
    return [];
  }

  const eventIds = eventsData.map((e) => e.id);

  // Fetch event results for these events
  const { data: resultsData, error: resultsError } = await supabase
    .from("event_results")
    .select("event_id, member_id, points")
    .in("event_id", eventIds);

  if (resultsError) {
    console.error("[resultsRepo] getOrderOfMeritLog results query failed:", resultsError);
    if (resultsError.code === "42P01") {
      return [];
    }
    throw new Error(resultsError.message || "Failed to get results");
  }

  if (!resultsData || resultsData.length === 0) {
    console.log("[resultsRepo] No results found for OOM events");
    return [];
  }

  // Get unique member IDs and fetch members
  const memberIds = [...new Set(resultsData.map((r) => r.member_id))];

  const { data: membersData, error: membersError } = await supabase
    .from("members")
    .select("id, name")
    .in("id", memberIds);

  if (membersError) {
    console.error("[resultsRepo] getOrderOfMeritLog members query failed:", membersError);
    throw new Error(membersError.message || "Failed to get members");
  }

  // Build lookup maps
  const eventsMap = new Map(eventsData.map((e) => [e.id, e]));
  const membersMap = new Map((membersData ?? []).map((m) => [m.id, m]));

  // Build results log entries, maintaining event order (by date desc)
  const logEntries: ResultsLogEntry[] = [];

  // Group results by event, preserving event order
  for (const event of eventsData) {
    const eventResults = resultsData
      .filter((r) => r.event_id === event.id)
      .sort((a, b) => (b.points || 0) - (a.points || 0)); // Sort by points desc within event

    for (const result of eventResults) {
      const member = membersMap.get(result.member_id);
      logEntries.push({
        eventId: event.id,
        eventName: event.name || "Unnamed Event",
        eventDate: event.date || null,
        format: event.format || null,
        memberId: result.member_id,
        memberName: member?.name || "Unknown",
        points: result.points || 0,
      });
    }
  }

  console.log("[resultsRepo] getOrderOfMeritLog returning:", logEntries.length, "entries");
  return logEntries;
}
