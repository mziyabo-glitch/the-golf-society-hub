import { supabase } from "@/lib/supabase";

/** Joint roster status for the member Checkout would load from event_entries. */
export async function fetchMemberEventEntryStatus(eventId: string, memberId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("event_entries")
    .select("status")
    .eq("event_id", eventId)
    .eq("player_id", memberId)
    .maybeSingle();
  if (error) {
    if (/event_entries|schema cache|does not exist|could not find/i.test(error.message)) return null;
    return null;
  }
  return (data?.status as string | null) ?? null;
}
