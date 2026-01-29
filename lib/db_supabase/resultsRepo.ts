import { supabase } from "@/lib/supabase";

export type EventResultRow = {
  id?: string;
  event_id: string;
  member_id: string;
  points: number;
  created_at?: string;
  updated_at?: string;
};

export async function getEventResults(eventId: string): Promise<EventResultRow[]> {
  const { data, error } = await supabase
    .from("event_results")
    .select("id,event_id,member_id,points,created_at,updated_at")
    .eq("event_id", eventId);

  if (error) throw error;
  return (data ?? []) as EventResultRow[];
}

export async function upsertEventResults(
  eventId: string,
  rows: { member_id: string; points: number }[]
): Promise<void> {
  const payload = rows.map((r) => ({
    event_id: eventId,
    member_id: r.member_id,
    points: Number.isFinite(r.points) ? r.points : 0,
  }));

  const { error } = await supabase
    .from("event_results")
    .upsert(payload, { onConflict: "event_id,member_id" });

  if (error) throw error;
}
