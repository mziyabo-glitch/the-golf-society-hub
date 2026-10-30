// lib/db_supabase/teeGroupsRepo.ts
import { supabase } from "@/lib/supabase";
import { assertTeeSheetUpsertWritten } from "@/lib/teeSheet/teeSheetDraftPersistence";

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
  created_at?: string;
  updated_at?: string;
  manual_gender?: "male" | "female" | null;
  manual_tee_assignment?: "men" | "ladies" | null;
  manual_tee_override?: "men" | "ladies" | null;
};

export type TeeSheetPlayerPolicyRow = {
  id: string;
  event_id: string;
  player_id: string;
  manual_gender: "male" | "female" | null;
  manual_tee_assignment: "men" | "ladies" | null;
  manual_tee_override?: "men" | "ladies" | null;
  updated_by?: string | null;
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
  manual_gender?: "male" | "female" | null;
  manual_tee_assignment?: "men" | "ladies" | null;
  manual_tee_override?: "men" | "ladies" | null;
};

export type TeeSheetPlayerPolicyInput = {
  player_id: string;
  manual_gender?: "male" | "female" | null;
  manual_tee_assignment?: "men" | "ladies" | null;
  manual_tee_override?: "men" | "ladies" | null;
};

export type UpsertTeeSheetResult = {
  eventId: string;
  groupsRequested: number;
  playersRequested: number;
  groupsInserted: number;
  playersInserted: number;
};

/**
 * Remove all tee_groups / tee_group_players rows for an event (via RPC).
 * Use before rebuilding from scratch or when clearing the tee sheet.
 */
const GUEST_PLAYER_ID_PREFIX = "guest-";

function isGuestPlayerId(playerId: string): boolean {
  return String(playerId).startsWith(GUEST_PLAYER_ID_PREFIX);
}

/**
 * Replace guest assignments on tee_group_players for an event (joint events: members live in event_entries).
 * Ensures tee_groups rows exist for referenced group numbers.
 */
export async function replaceTeeSheetGuestAssignments(
  eventId: string,
  groups: TeeGroupInput[],
  players: TeeGroupPlayerInput[],
): Promise<void> {
  if (!eventId?.trim()) throw new Error("replaceTeeSheetGuestAssignments: missing eventId");

  const guestPlayers = players.filter((p) => isGuestPlayerId(p.player_id));
  const guestGroups = groups.filter((g) =>
    guestPlayers.some((p) => p.group_number === g.group_number),
  );

  const { error: delErr } = await supabase
    .from("tee_group_players")
    .delete()
    .eq("event_id", eventId)
    .like("player_id", `${GUEST_PLAYER_ID_PREFIX}%`);

  if (delErr) {
    console.error("[teeGroupsRepo] replaceTeeSheetGuestAssignments delete:", delErr);
    throw new Error(delErr.message || "Failed to clear guest tee assignments");
  }

  if (guestGroups.length === 0 || guestPlayers.length === 0) return;

  const groupNumbers = [...new Set(guestGroups.map((g) => g.group_number))];
  const { data: existingGroups } = await supabase
    .from("tee_groups")
    .select("group_number")
    .eq("event_id", eventId)
    .in("group_number", groupNumbers);

  const haveGroup = new Set((existingGroups ?? []).map((r) => Number(r.group_number)));
  const missingGroupRows = guestGroups
    .filter((g) => !haveGroup.has(g.group_number))
    .map((g) => ({
      event_id: eventId,
      group_number: g.group_number,
      tee_time: formatTeeTimeForDb(g.tee_time),
    }));

  if (missingGroupRows.length > 0) {
    const { error: groupErr } = await supabase.from("tee_groups").insert(missingGroupRows);
    if (groupErr) {
      console.error("[teeGroupsRepo] replaceTeeSheetGuestAssignments insert groups:", groupErr);
      throw new Error(groupErr.message || "Failed to save guest tee groups");
    }
  }

  const playerRows = guestPlayers.map((p) => ({
    event_id: eventId,
    player_id: p.player_id,
    group_number: p.group_number,
    position: p.position,
    manual_gender: p.manual_gender ?? null,
    manual_tee_assignment: p.manual_tee_assignment ?? null,
    manual_tee_override: p.manual_tee_override ?? null,
  }));

  const { error: insErr } = await supabase.from("tee_group_players").insert(playerRows);
  if (insErr) {
    console.error("[teeGroupsRepo] replaceTeeSheetGuestAssignments insert players:", insErr);
    throw new Error(insErr.message || "Failed to save guest tee assignments");
  }
}

export async function clearPersistedTeeSheet(eventId: string): Promise<void> {
  if (!eventId?.trim()) throw new Error("clearPersistedTeeSheet: missing eventId");
  const { error } = await supabase.rpc("clear_tee_sheet_for_event", {
    p_event_id: eventId,
  });
  if (error) {
    console.error("[teeGroupsRepo] clearPersistedTeeSheet failed:", error);
    throw new Error(error.message || "Failed to clear tee sheet");
  }
  const { error: policyErr } = await supabase
    .from("tee_sheet_player_policy")
    .delete()
    .eq("event_id", eventId);
  if (policyErr) {
    console.error("[teeGroupsRepo] clear tee_sheet_player_policy failed:", policyErr);
    throw new Error(policyErr.message || "Failed to clear tee sheet player policy");
  }
}

export async function getTeeSheetPlayerPolicy(eventId: string): Promise<TeeSheetPlayerPolicyRow[]> {
  const { data, error } = await supabase
    .from("tee_sheet_player_policy")
    .select("*")
    .eq("event_id", eventId);
  if (error) {
    console.error("[teeGroupsRepo] getTeeSheetPlayerPolicy error:", error);
    throw new Error(error.message || "Failed to load tee sheet player policy");
  }
  return (data ?? []) as TeeSheetPlayerPolicyRow[];
}

export async function upsertTeeSheetPlayerPolicy(
  eventId: string,
  players: TeeSheetPlayerPolicyInput[],
): Promise<void> {
  if (!eventId?.trim()) throw new Error("upsertTeeSheetPlayerPolicy: missing eventId");
  const unique = new Map<string, TeeSheetPlayerPolicyInput>();
  for (const p of players) {
    if (!p.player_id?.trim()) continue;
    unique.set(String(p.player_id), p);
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const updater = user?.id ?? null;

  const rows = [...unique.values()].map((p) => ({
    event_id: eventId,
    player_id: String(p.player_id),
    manual_gender: p.manual_gender ?? null,
    manual_tee_assignment: p.manual_tee_assignment ?? null,
    manual_tee_override: p.manual_tee_override ?? null,
    updated_by: updater,
  }));

  const { error: delErr } = await supabase
    .from("tee_sheet_player_policy")
    .delete()
    .eq("event_id", eventId);
  if (delErr) {
    console.error("[teeGroupsRepo] upsertTeeSheetPlayerPolicy delete error:", delErr);
    throw new Error(delErr.message || "Failed to reset tee sheet player policy");
  }
  if (rows.length === 0) return;

  const { error } = await supabase.from("tee_sheet_player_policy").insert(rows);
  if (error) {
    console.error("[teeGroupsRepo] upsertTeeSheetPlayerPolicy insert error:", error);
    throw new Error(error.message || "Failed to save tee sheet player policy");
  }
}

/**
 * Upsert tee groups and player assignments for an event.
 * Replaces all existing groups/players for the event.
 */
export async function upsertTeeSheet(
  eventId: string,
  groups: TeeGroupInput[],
  players: TeeGroupPlayerInput[]
): Promise<UpsertTeeSheetResult> {
  if (__DEV__) {
    console.log("[teesheet] save start", {
      source: "teeGroupsRepo.upsertTeeSheet",
      eventId,
      groupsRequested: groups.length,
      playersRequested: players.length,
    });
  }

  await clearPersistedTeeSheet(eventId);

  if (groups.length === 0 && players.length === 0) {
    return {
      eventId,
      groupsRequested: 0,
      playersRequested: 0,
      groupsInserted: 0,
      playersInserted: 0,
    };
  }

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
    manual_gender: p.manual_gender ?? null,
    manual_tee_assignment: p.manual_tee_assignment ?? null,
    manual_tee_override: p.manual_tee_override ?? null,
  }));

  let groupsInserted = 0;
  let playersInserted = 0;

  if (groupRows.length > 0) {
    const { data: insertedGroups, error: groupsErr } = await supabase
      .from("tee_groups")
      .insert(groupRows)
      .select("id");
    if (groupsErr) {
      console.error("[teeGroupsRepo] insert tee_groups error:", groupsErr);
      throw new Error(groupsErr.message || "Failed to save tee groups");
    }
    groupsInserted = insertedGroups?.length ?? 0;
  }

  if (playerRows.length > 0) {
    const { data: insertedPlayers, error: playersErr } = await supabase
      .from("tee_group_players")
      .insert(playerRows)
      .select("id");
    if (playersErr) {
      console.error("[teeGroupsRepo] insert tee_group_players error:", playersErr);
      throw new Error(playersErr.message || "Failed to save tee group players");
    }
    playersInserted = insertedPlayers?.length ?? 0;
  }

  if (__DEV__) {
    console.log("[teesheet] save db response", {
      source: "teeGroupsRepo.upsertTeeSheet",
      eventId,
      groupsInserted,
      playersInserted,
    });
  }

  const upsertResult = {
    eventId,
    groupsRequested: groups.length,
    playersRequested: players.length,
    groupsInserted,
    playersInserted,
  };
  assertTeeSheetUpsertWritten(upsertResult);
  return upsertResult;
}
