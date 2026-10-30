/**
 * Application layer for gross score entry: combines {@link loadEventScoringContext}
 * with persisted hole + round rows. No scoring totals computed here beyond mapping DB → inputs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHoleScoresForPlayer, fetchPlayerRoundRow } from "@/lib/db_supabase/eventPlayerScoringRepo";
import { loadEventScoringContext } from "@/lib/scoring/loadEventScoringContext";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { EventPlayerHoleScoreRow, EventPlayerRoundRow } from "@/types/eventPlayerScoring";

export type LoadScoreEntrySheetDeps = {
  supabase?: SupabaseClient;
  loadEventScoringContext?: typeof loadEventScoringContext;
};

async function resolveClient(explicit?: SupabaseClient): Promise<SupabaseClient> {
  if (explicit) return explicit;
  const { supabase } = await import("@/lib/supabase");
  return supabase;
}

function mapHoleRow(r: Record<string, unknown>): EventPlayerHoleScoreRow {
  return {
    id: String(r.id),
    event_id: String(r.event_id),
    player_id: String(r.player_id),
    hole_number: Number(r.hole_number),
    gross_strokes: Number(r.gross_strokes),
    net_strokes: Number(r.net_strokes),
    stableford_points: Number(r.stableford_points ?? 0),
    strokes_received: Number(r.strokes_received ?? 0),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

function mapRoundRow(r: Record<string, unknown>): EventPlayerRoundRow {
  return {
    id: String(r.id),
    event_id: String(r.event_id),
    player_id: String(r.player_id),
    format: r.format as EventFormat,
    course_handicap: r.course_handicap != null ? Number(r.course_handicap) : null,
    playing_handicap: r.playing_handicap != null ? Number(r.playing_handicap) : null,
    gross_total: Number(r.gross_total ?? 0),
    net_total: Number(r.net_total ?? 0),
    stableford_points: Number(r.stableford_points ?? 0),
    holes_played: Number(r.holes_played ?? 0),
    calculated_at: String(r.calculated_at ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

/** Map persisted hole rows to the gross map consumed by {@link savePlayerRoundGrossScores}. */
export function grossScoresFromHoleRows(rows: readonly EventPlayerHoleScoreRow[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const h of rows) {
    out[h.hole_number] = h.gross_strokes;
  }
  return out;
}

export type ScoreEntrySheetLoad = {
  ctx: EventScoringContext;
  /** Gross strokes keyed by hole number (from `event_player_hole_scores`). */
  grossScoresByHole: Record<number, number>;
  savedHoleRows: EventPlayerHoleScoreRow[];
  /** Persisted summary row when present. */
  persistedRound: EventPlayerRoundRow | null;
};

/**
 * Load scoring context plus any saved gross hole scores and round summary for editing.
 */
export async function loadScoreEntrySheet(
  eventId: string,
  playerId: string,
  deps: LoadScoreEntrySheetDeps = {},
): Promise<ScoreEntrySheetLoad> {
  const client = await resolveClient(deps.supabase);
  const loadCtx = deps.loadEventScoringContext ?? loadEventScoringContext;
  const ctx = await loadCtx(eventId);
  if (ctx.eventId !== eventId) {
    throw new Error("loadScoreEntrySheet: scoring context event_id mismatch.");
  }
  if (!ctx.players.some((p) => p.memberId === playerId)) {
    throw new Error("loadScoreEntrySheet: player is not on the event player list.");
  }

  const rawHoles = await fetchHoleScoresForPlayer(client, eventId, playerId);
  const savedHoleRows = rawHoles.map(mapHoleRow);
  const grossScoresByHole = grossScoresFromHoleRows(savedHoleRows);

  const rawRound = await fetchPlayerRoundRow(client, eventId, playerId);
  const persistedRound = rawRound ? mapRoundRow(rawRound) : null;

  return { ctx, grossScoresByHole, savedHoleRows, persistedRound };
}
