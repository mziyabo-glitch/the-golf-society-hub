import type { SupabaseClient } from "@supabase/supabase-js";

/** Clears all hole rows for this player/event before writing the new card (removes holes dropped on edit). */
export async function deleteHoleScoresForPlayer(
  client: SupabaseClient,
  eventId: string,
  playerId: string,
): Promise<void> {
  const { error } = await client.from("event_player_hole_scores").delete().eq("event_id", eventId).eq("player_id", playerId);
  if (error && error.code !== "42P01" && !error.message?.includes("does not exist")) {
    throw new Error(error.message || "deleteHoleScoresForPlayer failed");
  }
}

/**
 * Upserts per-hole rows on the unique (event_id, player_id, hole_number) constraint.
 * Callers should delete existing rows for the player/event first when replacing the whole card,
 * so stale holes cannot remain after a shorter save.
 */
export async function upsertPlayerHoleScores(client: SupabaseClient, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from("event_player_hole_scores").upsert(rows, {
    onConflict: "event_id,player_id,hole_number",
  });
  if (error) throw new Error(error.message || "upsertPlayerHoleScores failed");
}

export async function upsertPlayerRound(
  client: SupabaseClient,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.from("event_player_rounds").upsert(row, { onConflict: "event_id,player_id" }).select().single();
  if (error) throw new Error(error.message || "upsertPlayerRound failed");
  if (!data) throw new Error("upsertPlayerRound: no row returned");
  return data as Record<string, unknown>;
}

export async function fetchRoundsForEvent(client: SupabaseClient, eventId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await client.from("event_player_rounds").select("*").eq("event_id", eventId);
  if (error && error.code !== "42P01" && !error.message?.includes("does not exist")) {
    throw new Error(error.message || "fetchRoundsForEvent failed");
  }
  return (data ?? []) as Record<string, unknown>[];
}

/** Distinct `event_id` values that have at least one saved player round (gross workflow footprint). */
export async function fetchEventIdsWithAnyPlayerRound(
  client: SupabaseClient,
  eventIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(eventIds.filter((id) => Boolean(id?.trim())))];
  if (ids.length === 0) return new Set();
  const { data, error } = await client.from("event_player_rounds").select("event_id").in("event_id", ids);
  if (error && error.code !== "42P01" && !String(error.message ?? "").includes("does not exist")) {
    throw new Error(error.message || "fetchEventIdsWithAnyPlayerRound failed");
  }
  return new Set((data ?? []).map((r: { event_id: string }) => String(r.event_id)));
}

export async function fetchPlayerRoundRow(
  client: SupabaseClient,
  eventId: string,
  playerId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await client
    .from("event_player_rounds")
    .select("*")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error && error.code !== "42P01" && !error.message?.includes("does not exist")) {
    throw new Error(error.message || "fetchPlayerRoundRow failed");
  }
  return (data ?? null) as Record<string, unknown> | null;
}

export async function fetchHoleScoresForPlayer(
  client: SupabaseClient,
  eventId: string,
  playerId: string,
): Promise<Record<string, unknown>[]> {
  const { data, error } = await client
    .from("event_player_hole_scores")
    .select("*")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .order("hole_number", { ascending: true });
  if (error && error.code !== "42P01" && !error.message?.includes("does not exist")) {
    throw new Error(error.message || "fetchHoleScoresForPlayer failed");
  }
  return (data ?? []) as Record<string, unknown>[];
}
