/**
 * Canonical score entry: **gross strokes per hole** are the source of truth.
 * Each save replaces hole rows for that player/event and recomputes the round summary + leaderboard.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteHoleScoresForPlayer,
  fetchHoleScoresForPlayer,
  fetchRoundsForEvent,
  upsertPlayerHoleScores,
  upsertPlayerRound,
} from "@/lib/db_supabase/eventPlayerScoringRepo";
import { validateGrossScoresAgainstSnapshot } from "@/lib/scoring/grossScoreEntryValidation";
import { loadEventScoringContext } from "@/lib/scoring/loadEventScoringContext";
import { scoreEnteredHolesFromGross } from "@/lib/scoring/eventScoringEngine";
import { buildLeaderboardFromRoundSummaries, type RoundSummaryInput } from "./eventLeaderboardFromRounds";
import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { EventPlayerHoleScoreRow, EventPlayerRoundRow, LeaderboardRow, SavePlayerRoundGrossScoresResult } from "@/types/eventPlayerScoring";

export type SavePlayerRoundGrossScoresDeps = {
  supabase?: SupabaseClient;
  loadEventScoringContext?: typeof loadEventScoringContext;
};

async function resolveClient(explicit?: SupabaseClient): Promise<SupabaseClient> {
  if (explicit) return explicit;
  const { supabase } = await import("@/lib/supabase");
  return supabase;
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

function roundsToSummaries(rows: Record<string, unknown>[]): RoundSummaryInput[] {
  return rows.map((r) => ({
    player_id: String(r.player_id),
    gross_total: Number(r.gross_total ?? 0),
    net_total: Number(r.net_total ?? 0),
    stableford_points: Number(r.stableford_points ?? 0),
    holes_played: Number(r.holes_played ?? 0),
    course_handicap: r.course_handicap != null ? Number(r.course_handicap) : null,
    playing_handicap: r.playing_handicap != null ? Number(r.playing_handicap) : null,
  }));
}

/**
 * Persist gross hole scores for one player: **delete** existing hole rows for that player/event,
 * **upsert** the new hole rows (unique `event_id,player_id,hole_number`), then **upsert** the derived
 * round summary on `event_id,player_id`. Recomputes all derived fields every time; idempotent for the same payload.
 */
export async function savePlayerRoundGrossScores(
  eventId: string,
  playerId: string,
  grossScoresByHole: Readonly<Record<number, number>>,
  deps: SavePlayerRoundGrossScoresDeps = {},
): Promise<SavePlayerRoundGrossScoresResult> {
  const client = await resolveClient(deps.supabase);
  const loadCtx = deps.loadEventScoringContext ?? loadEventScoringContext;

  const ctx = await loadCtx(eventId);
  if (!ctx.players.some((p) => p.memberId === playerId)) {
    throw new Error("savePlayerRoundGrossScores: player is not on the event player list.");
  }

  const issues = validateGrossScoresAgainstSnapshot(grossScoresByHole, ctx.holes);
  if (issues.length) {
    throw new Error(`savePlayerRoundGrossScores: invalid gross scores:\n- ${issues.join("\n- ")}`);
  }

  const computed = scoreEnteredHolesFromGross(ctx, playerId, grossScoresByHole);

  await deleteHoleScoresForPlayer(client, eventId, playerId);

  const now = new Date().toISOString();
  const holePayload = computed.enteredHoles.map((h) => ({
    event_id: eventId,
    player_id: playerId,
    hole_number: h.holeNumber,
    gross_strokes: h.grossStrokes,
    net_strokes: h.netStrokes,
    stableford_points: h.stablefordPoints,
    strokes_received: h.strokesReceived,
  }));

  await upsertPlayerHoleScores(client, holePayload);

  const roundPayload = {
    event_id: eventId,
    player_id: playerId,
    format: ctx.format,
    course_handicap: computed.courseHandicap,
    playing_handicap: computed.playingHandicap,
    gross_total: computed.grossTotal,
    net_total: computed.netTotal,
    stableford_points: computed.stablefordPointsTotal,
    holes_played: computed.holesPlayed,
    calculated_at: now,
  };

  const savedRoundRaw = await upsertPlayerRound(client, roundPayload);
  const round = mapRoundRow(savedRoundRaw);

  const holeRowsRaw = await fetchHoleScoresForPlayer(client, eventId, playerId);
  const holes = holeRowsRaw.map(mapHoleRow);

  const allRounds = await fetchRoundsForEvent(client, eventId);
  const leaderboard = buildLeaderboardFromRoundSummaries(ctx.format, ctx.holes.length, roundsToSummaries(allRounds));

  return { round, holes, leaderboard };
}

/** Read persisted round summaries and build the leaderboard (no hole recompute). */
export async function getEventScoringLeaderboard(
  eventId: string,
  deps: SavePlayerRoundGrossScoresDeps = {},
): Promise<LeaderboardRow[]> {
  const client = await resolveClient(deps.supabase);
  const loadCtx = deps.loadEventScoringContext ?? loadEventScoringContext;
  const ctx = await loadCtx(eventId);
  if (ctx.eventId !== eventId) {
    throw new Error("getEventScoringLeaderboard: scoring context event_id mismatch.");
  }
  const allRounds = await fetchRoundsForEvent(client, eventId);
  return buildLeaderboardFromRoundSummaries(ctx.format, ctx.holes.length, roundsToSummaries(allRounds));
}
