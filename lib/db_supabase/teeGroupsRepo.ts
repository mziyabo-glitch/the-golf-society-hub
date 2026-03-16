// lib/db_supabase/teeGroupsRepo.ts
import { supabase } from "@/lib/supabase";

export type TeeGroupRow = {
  id: string;
  event_id: string;
  group_number: number;
  tee_time: string | null;
  created_at?: string;
  updated_at?: string;
};

export type TeeGroupPlayerRow = {
  id: string;
  event_id: string;
  group_number: number;
  position: number;
  player_id: string;
  society_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Normalize time to HH:MM:SS for Postgres TIME */
function formatTeeTimeForDb(input: string): string {
  const s = (input || "08:00").trim() || "08:00";
  const normalized = s.replace(/\./g, ":");
  const match = normalized.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (match) {
    const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
    const sec = match[3] != null ? Math.min(59, Math.max(0, parseInt(match[3], 10))) : 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return "08:00:00";
}

/** Parse DB time (HH:MM:SS or HH:MM) to display string HH:MM */
export function teeTimeToDisplay(dbTime: string | null): string {
  if (!dbTime) return "08:00";
  const parts = dbTime.split(":");
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (!isNaN(h) && !isNaN(m)) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }
  return "08:00";
}

/**
 * Load persisted tee sheet for an event (groups + player assignments).
 * Use this when event is selected to restore saved tee sheet.
 * Returns empty arrays if tables don't exist or on error (caller will generate default).
 */
export async function loadTeeSheet(eventId: string): Promise<{ groups: TeeGroupRow[]; players: TeeGroupPlayerRow[] }> {
  const { data: groups, error: groupsErr } = await supabase
    .from("tee_groups")
    .select("*")
    .eq("event_id", eventId)
    .order("group_number", { ascending: true });

  const { data: players, error: playersErr } = await supabase
    .from("tee_group_players")
    .select("*")
    .eq("event_id", eventId)
    .order("group_number", { ascending: true })
    .order("position", { ascending: true });

  if (groupsErr || playersErr) {
    console.warn("[teeGroupsRepo] loadTeeSheet error (tables may not exist):", groupsErr || playersErr);
    return { groups: [], players: [] };
  }

  return {
    groups: (groups ?? []) as TeeGroupRow[],
    players: (players ?? []) as TeeGroupPlayerRow[],
  };
}

/**
 * Get tee groups for an event
 */
export async function getTeeGroups(eventId: string): Promise<TeeGroupRow[]> {
  const { data, error } = await supabase
    .from("tee_groups")
    .select("*")
    .eq("event_id", eventId)
    .order("group_number", { ascending: true });

  if (error) {
    console.error("[teeGroupsRepo] getTeeGroups error:", error);
    throw new Error(error.message || "Failed to load tee groups");
  }
  return (data ?? []) as TeeGroupRow[];
}

/**
 * Get tee group player assignments for an event
 */
export async function getTeeGroupPlayers(eventId: string): Promise<TeeGroupPlayerRow[]> {
  const { data, error } = await supabase
    .from("tee_group_players")
    .select("*")
    .eq("event_id", eventId)
    .order("group_number", { ascending: true })
    .order("position", { ascending: true });

  if (error) {
    console.error("[teeGroupsRepo] getTeeGroupPlayers error:", error);
    throw new Error(error.message || "Failed to load tee group players");
  }
  return (data ?? []) as TeeGroupPlayerRow[];
}

export type TeeGroupInput = {
  group_number: number;
  tee_time: string;
};

export type TeeGroupPlayerInput = {
  player_id: string;
  group_number: number;
  position: number;
  society_id?: string | null;
};

/**
 * Upsert tee groups and player assignments for an event.
 * Replaces all existing groups/players for the event.
 */
export async function upsertTeeSheet(
  eventId: string,
  groups: TeeGroupInput[],
  players: TeeGroupPlayerInput[]
): Promise<void> {
  // Clear existing rows via RPC (bypasses RLS delete issues; permission checked in RPC)
  const { error: clearErr } = await supabase.rpc("clear_tee_sheet_for_event", {
    p_event_id: eventId,
  });

  if (clearErr) {
    console.error("[teeGroupsRepo] Failed clearing tee sheet:", clearErr);
    throw new Error(clearErr.message || "Failed to clear tee groups");
  }

  if (groups.length === 0 && players.length === 0) return;

  const groupRows = groups.map((g) => ({
    event_id: eventId,
    group_number: g.group_number,
    tee_time: formatTeeTimeForDb(g.tee_time),
  }));

  const playerRows = players.map((p) => ({
    event_id: eventId,
    player_id: p.player_id,
    group_number: p.group_number,
    position: p.position,
    society_id: p.society_id ?? null,
  }));

  if (groupRows.length > 0) {
    const { error: groupsErr } = await supabase.from("tee_groups").insert(groupRows);
    if (groupsErr) {
      console.error("[teeGroupsRepo] insert tee_groups error:", groupsErr);
      throw new Error(groupsErr.message || "Failed to save tee groups");
    }
  }

  if (playerRows.length > 0) {
    const { error: playersErr } = await supabase.from("tee_group_players").insert(playerRows);
    if (playersErr) {
      console.error("[teeGroupsRepo] insert tee_group_players error:", playersErr);
      throw new Error(playersErr.message || "Failed to save tee group players");
    }
  }
}
