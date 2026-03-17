/**
 * eventPlayerRepo.ts
 * Canonical player selection for events. Single source of truth.
 * Members and guests are both stored in event_players.
 */

import { supabase } from "@/lib/supabase";

export type EventPlayerRow = {
  id: string;
  event_id: string;
  member_id: string | null;
  event_guest_id: string | null;
  society_id: string;
  position: number;
  created_at?: string;
};

/**
 * Get all event players (members + guests) for an event, ordered by position.
 */
export async function getEventPlayers(eventId: string): Promise<EventPlayerRow[]> {
  const { data, error } = await supabase
    .from("event_players")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[eventPlayerRepo] getEventPlayers:", error.message);
    return [];
  }
  return (data ?? []) as EventPlayerRow[];
}

/**
 * Get member IDs for an event (for playerIds compatibility).
 */
export async function getEventMemberIds(eventId: string): Promise<string[]> {
  const rows = await getEventPlayers(eventId);
  return rows.filter((r) => r.member_id != null).map((r) => r.member_id!);
}

/**
 * Get guest IDs for an event.
 */
export async function getEventGuestIds(eventId: string): Promise<string[]> {
  const rows = await getEventPlayers(eventId);
  return rows.filter((r) => r.event_guest_id != null).map((r) => r.event_guest_id!);
}

/**
 * Set event players from member IDs and guest IDs. Replaces existing.
 * Order preserved: memberIds first, then guestIds.
 */
export async function setEventPlayers(
  eventId: string,
  memberIds: string[],
  guestRows: { id: string; society_id: string }[]
): Promise<void> {
  const { error: delErr } = await supabase
    .from("event_players")
    .delete()
    .eq("event_id", eventId);

  if (delErr) {
    console.error("[eventPlayerRepo] setEventPlayers delete:", delErr.message);
    throw new Error(delErr.message || "Failed to clear event players");
  }

  const insertRows: { event_id: string; member_id: string | null; event_guest_id: string | null; society_id: string; position: number }[] = [];
  let pos = 0;

  if (memberIds.length > 0) {
    const { data: members, error: memErr } = await supabase
      .from("members")
      .select("id, society_id")
      .in("id", memberIds);

    if (memErr) {
      console.error("[eventPlayerRepo] setEventPlayers fetch members:", memErr.message);
      throw new Error(memErr.message || "Failed to fetch members");
    }

    const memberMap = new Map((members ?? []).map((m: any) => [m.id, m.society_id]));
    for (const mid of memberIds) {
      const sid = memberMap.get(mid);
      if (sid) {
        insertRows.push({ event_id: eventId, member_id: mid, event_guest_id: null, society_id: sid, position: pos++ });
      }
    }
  }

  for (const g of guestRows) {
    insertRows.push({ event_id: eventId, member_id: null, event_guest_id: g.id, society_id: g.society_id, position: pos++ });
  }

  if (insertRows.length === 0) return;

  const { error: insErr } = await supabase.from("event_players").insert(insertRows);

  if (insErr) {
    console.error("[eventPlayerRepo] setEventPlayers insert:", insErr.message);
    throw new Error(insErr.message || "Failed to set event players");
  }
}

/**
 * Add a guest to event_players (when adding a new guest to the event).
 */
export async function addEventPlayerGuest(
  eventId: string,
  eventGuestId: string,
  societyId: string
): Promise<void> {
  const rows = await getEventPlayers(eventId);
  const maxPos = rows.length > 0 ? Math.max(...rows.map((r) => r.position)) : -1;

  const { error } = await supabase.from("event_players").insert({
    event_id: eventId,
    event_guest_id: eventGuestId,
    society_id: societyId,
    position: maxPos + 1,
  });

  if (error) {
    console.error("[eventPlayerRepo] addEventPlayerGuest:", error.message);
    throw new Error(error.message || "Failed to add guest to event players");
  }
}

/**
 * Set event players from member IDs and guest IDs (legacy-style API).
 * Fetches guest society_ids from event_guests.
 */
export async function setEventPlayersFromIds(
  eventId: string,
  memberIds: string[],
  guestIds: string[]
): Promise<void> {
  const guestRows: { id: string; society_id: string }[] = [];
  if (guestIds.length > 0) {
    const { data: guests } = await supabase
      .from("event_guests")
      .select("id, society_id")
      .eq("event_id", eventId)
      .in("id", guestIds);
    for (const g of guests ?? []) {
      guestRows.push({ id: (g as any).id, society_id: (g as any).society_id });
    }
  }
  await setEventPlayers(eventId, memberIds, guestRows);
}

/**
 * Remove a guest from event_players (when deleting a guest).
 */
export async function removeEventPlayerGuest(eventId: string, eventGuestId: string): Promise<void> {
  const { error } = await supabase
    .from("event_players")
    .delete()
    .eq("event_id", eventId)
    .eq("event_guest_id", eventGuestId);

  if (error) {
    console.error("[eventPlayerRepo] removeEventPlayerGuest:", error.message);
    throw new Error(error.message || "Failed to remove guest from event players");
  }
}
