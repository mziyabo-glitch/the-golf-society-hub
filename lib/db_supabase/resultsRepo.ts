import { supabase } from "@/lib/supabase";

export type EventResultRow = {
  id: string;
  event_id: string;
  member_id: string;
  points: number;
  created_at?: string;
  updated_at?: string;
};

export async function getEventResults(eventId: string): Promise<EventResultRow[]> {
  const { data, error } = await supabase
    .from("event_results")
    .select("*")
    .eq("event_id", eventId);

  if (error) throw error;
  return (data ?? []) as any;
}

export async function upsertEventResult(input: {
  event_id: string;
  member_id: string;
  points: number;
}): Promise<EventResultRow | null> {
  const { data, error } = await supabase
    .from("event_results")
    .upsert(
      {
        event_id: input.event_id,
        member_id: input.member_id,
        points: input.points,
      },
      { onConflict: "event_id,member_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return (data ?? null) as any;
}
