import { supabase } from "@/lib/supabase";
import { getMembersBySocietyId } from "./memberRepo";

export type OomRow = {
  member_id: string;
  name: string;
  totalPoints: number;
  eventsPlayed: number;
  position: number;
};

export async function getOomLeaderboard(societyId: string): Promise<OomRow[]> {
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id")
    .eq("society_id", societyId)
    .eq("classification", "oom");

  if (eventsError) throw eventsError;
  if (!events || events.length === 0) return [];

  const eventIds = events.map((e) => e.id);

  const { data: results, error: resultsError } = await supabase
    .from("event_results")
    .select("member_id, points")
    .in("event_id", eventIds);

  if (resultsError) throw resultsError;
  if (!results || results.length === 0) return [];

  const members = await getMembersBySocietyId(societyId);
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const totals = new Map<string, { totalPoints: number; eventsPlayed: number }>();

  for (const r of results) {
    if (!totals.has(r.member_id)) {
      totals.set(r.member_id, { totalPoints: 0, eventsPlayed: 0 });
    }
    const row = totals.get(r.member_id)!;
    row.totalPoints += r.points ?? 0;
    row.eventsPlayed += 1;
  }

  const sorted = Array.from(totals.entries())
    .map(([member_id, v]) => ({
      member_id,
      totalPoints: v.totalPoints,
      eventsPlayed: v.eventsPlayed,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  let position = 0;
  let lastPoints: number | null = null;

  return sorted.map((row, index) => {
    if (lastPoints === null || row.totalPoints < lastPoints) {
      position = index + 1;
    }
    lastPoints = row.totalPoints;

    return {
      position,
      member_id: row.member_id,
      name: memberMap.get(row.member_id)?.name ?? "Member",
      totalPoints: row.totalPoints,
      eventsPlayed: row.eventsPlayed,
    };
  });
}
