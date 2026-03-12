// lib/db_supabase/eventGuestRepo.ts
// Guest players for events (name, sex, handicap index).

import { supabase } from "@/lib/supabase";

export type EventGuest = {
  id: string;
  society_id: string;
  event_id: string;
  name: string;
  sex: "male" | "female";
  handicap_index: number | null;
  created_at: string;
  updated_at: string;
};

export async function getEventGuests(eventId: string): Promise<EventGuest[]> {
  const { data, error } = await supabase
    .from("event_guests")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[eventGuestRepo] getEventGuests:", error.message);
    return [];
  }
  return (data ?? []) as EventGuest[];
}

export async function addEventGuest(opts: {
  eventId: string;
  societyId: string;
  name: string;
  sex: "male" | "female";
  handicapIndex?: number | null;
}): Promise<EventGuest | null> {
  const { data, error } = await supabase
    .from("event_guests")
    .insert({
      event_id: opts.eventId,
      society_id: opts.societyId,
      name: opts.name.trim(),
      sex: opts.sex,
      handicap_index: opts.handicapIndex ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[eventGuestRepo] addEventGuest:", error.message);
    throw new Error(error.message || "Failed to add guest");
  }
  return data as EventGuest;
}

export async function updateEventGuest(
  guestId: string,
  updates: { name?: string; sex?: "male" | "female"; handicapIndex?: number | null }
): Promise<EventGuest | null> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.sex !== undefined) payload.sex = updates.sex;
  if (updates.handicapIndex !== undefined) payload.handicap_index = updates.handicapIndex;

  if (Object.keys(payload).length === 0) return null;

  const { data, error } = await supabase
    .from("event_guests")
    .update(payload)
    .eq("id", guestId)
    .select()
    .single();

  if (error) {
    console.error("[eventGuestRepo] updateEventGuest:", error.message);
    throw new Error(error.message || "Failed to update guest");
  }
  return data as EventGuest;
}

export async function deleteEventGuest(guestId: string): Promise<void> {
  const { error } = await supabase.from("event_guests").delete().eq("id", guestId);

  if (error) {
    console.error("[eventGuestRepo] deleteEventGuest:", error.message);
    throw new Error(error.message || "Failed to delete guest");
  }
}
