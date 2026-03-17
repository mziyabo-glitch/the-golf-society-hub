/**
 * eventPlayerRepo: event_players table - selected members + guests for an event.
 * Replaces events.player_ids as the canonical source for event participants.
 */
import { supabase } from "@/lib/supabase";

export type EventPlayerRow = {
  id: string;
  event_id: string;
  member_id: string | null;
  event_guest_id: string | null;
  position: number;
  representing_society_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Normalized player ID for API: member uuid or "guest-{event_guest_id}" */
export type EventPlayerId = string;

/**
 * Get event players for an event, ordered by position.
 * Returns array of { memberId } or { eventGuestId } for each row.
 */
export async function getEventPlayers(eventId: string): Promise<EventPlayerRow[]> {
  const { data, error } = await supabase
    .from("event_players")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[eventPlayerRepo] getEventPlayers failed:", error.message);
    return [];
  }
  return (data ?? []) as EventPlayerRow[];
}

/**
 * Get member IDs only (for backward compat with playerIds).
 */
export async function getEventMemberIds(eventId: string): Promise<string[]> {
  const rows = await getEventPlayers(eventId);
  return rows.filter((r) => r.member_id != null).map((r) => r.member_id!);
}

/**
 * Get guest IDs for event (from event_players).
 */
export async function getEventGuestIds(eventId: string): Promise<string[]> {
  const rows = await getEventPlayers(eventId);
  return rows.filter((r) => r.event_guest_id != null).map((r) => r.event_guest_id!);
}

/**
 * Get player IDs as array: member IDs and "guest-{id}" for guests.
 * Compatible with tee sheet and other consumers.
 */
export async function getEventPlayerIds(eventId: string): Promise<string[]> {
  const rows = await getEventPlayers(eventId);
  return rows.map((r) => {
    if (r.member_id) return r.member_id;
    if (r.event_guest_id) return `guest-${r.event_guest_id}`;
    return "";
  }).filter(Boolean);
}

/**
 * Set event players for an event. Replaces existing.
 * @param eventId - Event ID
 * @param players - Array of { memberId } or { eventGuestId } in desired order
 */
export async function setEventPlayers(
  eventId: string,
  players: Array<{ memberId?: string; eventGuestId?: string }>
): Promise<void> {
  const { error: delErr } = await supabase
    .from("event_players")
    .delete()
    .eq("event_id", eventId);

  if (delErr) {
    console.error("[eventPlayerRepo] setEventPlayers delete failed:", delErr.message);
    throw new Error(delErr.message || "Failed to clear event players");
  }

  const rows = players
    .map((p, idx) => {
      if (p.memberId) {
        return { event_id: eventId, member_id: p.memberId, event_guest_id: null, position: idx };
      }
      if (p.eventGuestId) {
        return { event_id: eventId, member_id: null, event_guest_id: p.eventGuestId, position: idx };
      }
      return null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;

  const { error: insErr } = await supabase.from("event_players").insert(rows);

  if (insErr) {
    console.error("[eventPlayerRepo] setEventPlayers insert failed:", insErr.message);
    throw new Error(insErr.message || "Failed to set event players");
  }
}

/**
 * Set event players from member IDs and guest IDs (legacy format).
 * memberIds: array of member UUIDs
 * guestIds: array of event_guest IDs (will be stored as event_guest_id)
 */
export async function setEventPlayersFromIds(
  eventId: string,
  memberIds: string[],
  guestIds: string[] = []
): Promise<void> {
  const players: Array<{ memberId?: string; eventGuestId?: string }> = [
    ...memberIds.map((id) => ({ memberId: id })),
    ...guestIds.map((id) => ({ eventGuestId: id })),
  ];
  await setEventPlayers(eventId, players);
}

/**
 * Add a guest to event_players (when adding a new guest via event_guests).
 */
export async function addEventPlayerGuest(eventId: string, eventGuestId: string): Promise<void> {
  const rows = await getEventPlayers(eventId);
  const maxPos = rows.length > 0 ? Math.max(...rows.map((r) => r.position)) + 1 : 0;
  const { error } = await supabase.from("event_players").insert({
    event_id: eventId,
    member_id: null,
    event_guest_id: eventGuestId,
    position: maxPos,
  });
  if (error) {
    console.error("[eventPlayerRepo] addEventPlayerGuest failed:", error.message);
    throw new Error(error.message || "Failed to add guest to event players");
  }
}
