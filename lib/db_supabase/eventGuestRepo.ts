// lib/db_supabase/eventGuestRepo.ts
// Guest players for events (name, sex, handicap index).

import { supabase } from "@/lib/supabase";

export type EventGuest = {
  id: string;
  society_id: string;
  event_id: string;
  name: string;
  /** Guest-only row type for unified payment/admin datasets. */
  attendee_type: "guest";
  sex: "male" | "female" | null;
  handicap_index: number | null;
  paid: boolean;
  created_at: string;
  updated_at: string;
};

function normalizeGuestRow(row: any): EventGuest {
  return {
    ...(row ?? {}),
    attendee_type: "guest",
    paid: row?.paid === true,
  } as EventGuest;
}

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
  return (data ?? []).map(normalizeGuestRow);
}

export async function addEventGuest(opts: {
  eventId: string;
  societyId: string;
  name: string;
  sex: "male" | "female" | null;
  handicapIndex?: number | null;
}): Promise<EventGuest | null> {
  const { data, error } = await supabase
    .from("event_guests")
    .insert({
      event_id: opts.eventId,
      society_id: opts.societyId,
      name: opts.name.trim(),
      paid: false,
      sex: opts.sex,
      handicap_index: opts.handicapIndex ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[eventGuestRepo] addEventGuest:", error.message);
    throw new Error(error.message || "Failed to add guest");
  }
  return data ? normalizeGuestRow(data) : null;
}

/** Mark a guest paid/unpaid for event admin/payment workflows. */
export async function setEventGuestPaid(guestId: string, paid: boolean): Promise<EventGuest | null> {
  const { data, error } = await supabase
    .from("event_guests")
    .update({ paid })
    .eq("id", guestId)
    .select()
    .single();

  if (error) {
    console.error("[eventGuestRepo] setEventGuestPaid:", error.message);
    throw new Error(error.message || "Failed to update guest payment status");
  }
  return data ? normalizeGuestRow(data) : null;
}

export async function updateEventGuest(
  guestId: string,
  updates: { name?: string; sex?: "male" | "female" | null; handicapIndex?: number | null }
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
  return data ? normalizeGuestRow(data) : null;
}

export async function deleteEventGuest(guestId: string): Promise<void> {
  const { error } = await supabase
    .from("event_guests")
    .delete()
    .eq("id", guestId);

  if (error) {
    console.error("[eventGuestRepo] deleteEventGuest:", error.message);
    throw new Error(error.message || "Failed to delete guest");
  }
}

/** Delete guest row scoped to event for extra safety in event screens. */
export async function deleteEventGuestForEvent(guestId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from("event_guests")
    .delete()
    .eq("id", guestId)
    .eq("event_id", eventId);

  if (error) {
    console.error("[eventGuestRepo] deleteEventGuestForEvent:", error.message);
    throw new Error(error.message || "Failed to delete guest");
  }
}
