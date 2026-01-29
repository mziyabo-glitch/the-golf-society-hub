import { supabase } from "@/lib/supabase";

export type OomLeaderboardRow = {
  member_id: string;
  total_points: number;
};

export async function getOomLeaderboard(societyId: string): Promise<OomLeaderboardRow[]> {
  const { data: eventsData, error: eventsError } = await supabase
    .from("events")
    .select("id")
    .eq("society_id", societyId)
    .or("classification.eq.oom,is_oom.eq.true");

  if (eventsError) {
    console.error("[oomRepo] getOomLeaderboard events failed:", {
      message: eventsError.message,
      details: eventsError.details,
      hint: eventsError.hint,
      code: eventsError.code,
    });
    return [];
  }

  const eventIds = (eventsData ?? []).map((event) => event.id).filter(Boolean);
  if (eventIds.length === 0) {
    return [];
  }

  const { data: resultsData, error: resultsError } = await supabase
    .from("event_results")
    .select("member_id,points")
    .in("event_id", eventIds);

  if (resultsError) {
    console.error("[oomRepo] getOomLeaderboard results failed:", {
      message: resultsError.message,
      details: resultsError.details,
      hint: resultsError.hint,
      code: resultsError.code,
    });
    return [];
  }

  const totals = new Map<string, number>();
  (resultsData ?? []).forEach((row) => {
    const current = totals.get(row.member_id) ?? 0;
    totals.set(row.member_id, current + (row.points ?? 0));
  });

  return Array.from(totals.entries()).map(([member_id, total_points]) => ({
    member_id,
    total_points,
  }));
}
