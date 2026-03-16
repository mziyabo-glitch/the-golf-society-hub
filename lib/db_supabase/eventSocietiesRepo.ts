/**
 * event_societies: participating societies for multi-society events.
 */
import { supabase } from "@/lib/supabase";

export type EventSocietyRow = {
  id: string;
  event_id: string;
  society_id: string;
  created_at?: string;
};

/**
 * Get participating society IDs for an event.
 */
export async function getEventSocietyIds(eventId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("event_societies")
    .select("society_id")
    .eq("event_id", eventId);

  if (error) {
    console.warn("[eventSocietiesRepo] getEventSocietyIds failed:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => r.society_id);
}

/**
 * Set participating societies for an event. Replaces existing.
 * Always includes host society.
 */
export async function setEventSocieties(
  eventId: string,
  hostSocietyId: string,
  participatingSocietyIds: string[]
): Promise<void> {
  const unique = Array.from(new Set([hostSocietyId, ...participatingSocietyIds]));

  const { error: delErr } = await supabase
    .from("event_societies")
    .delete()
    .eq("event_id", eventId);

  if (delErr) {
    console.error("[eventSocietiesRepo] delete failed:", delErr);
    throw new Error(delErr.message || "Failed to clear event societies");
  }

  if (unique.length === 0) return;

  const rows = unique.map((society_id) => ({ event_id: eventId, society_id }));
  const { error: insErr } = await supabase.from("event_societies").insert(rows);

  if (insErr) {
    console.error("[eventSocietiesRepo] insert failed:", insErr);
    throw new Error(insErr.message || "Failed to insert event societies");
  }
}

/**
 * Check if a society is participating in an event.
 */
export async function isSocietyParticipating(
  eventId: string,
  societyId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("event_societies")
    .select("id")
    .eq("event_id", eventId)
    .eq("society_id", societyId)
    .maybeSingle();

  if (error) return false;
  return !!data;
}
