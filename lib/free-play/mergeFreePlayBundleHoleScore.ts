import type { FreePlayRoundBundle, FreePlayRoundHoleScore, FreePlayRoundScore } from "@/types/freePlayScorecard";

function aggregateForPlayer(holeScores: FreePlayRoundHoleScore[], roundPlayerId: string): {
  holes_played: number;
  quick_total: number | null;
} {
  const scored = holeScores.filter(
    (h) =>
      h.round_player_id === roundPlayerId &&
      h.gross_strokes != null &&
      Number.isFinite(Number(h.gross_strokes)),
  );
  const holes_played = scored.length;
  const quick_total =
    holes_played > 0 ? scored.reduce((sum, h) => sum + Number(h.gross_strokes), 0) : null;
  return { holes_played, quick_total };
}

/**
 * Merge one hole gross into an in-memory bundle (optimistic UI + leaderboard).
 * Matches server semantics: null gross = pickup row still present but excluded from totals.
 */
export function mergeHoleGrossIntoBundle(
  bundle: FreePlayRoundBundle,
  roundPlayerId: string,
  holeNumber: number,
  grossStrokes: number | null,
): FreePlayRoundBundle {
  const roundId = bundle.round.id;
  const now = new Date().toISOString();
  const nextHoleScores = [...bundle.holeScores];
  const ix = nextHoleScores.findIndex(
    (h) => h.round_player_id === roundPlayerId && h.hole_number === holeNumber,
  );

  if (ix >= 0) {
    nextHoleScores[ix] = {
      ...nextHoleScores[ix],
      gross_strokes: grossStrokes,
      updated_at: now,
    };
  } else {
    nextHoleScores.push({
      id: `optimistic:${roundPlayerId}:${holeNumber}`,
      round_id: roundId,
      round_player_id: roundPlayerId,
      hole_number: holeNumber,
      gross_strokes: grossStrokes,
      created_at: now,
      updated_at: now,
    });
  }

  const { holes_played, quick_total } = aggregateForPlayer(nextHoleScores, roundPlayerId);
  const nextScores: FreePlayRoundScore[] = bundle.scores.map((s) =>
    s.round_player_id === roundPlayerId
      ? { ...s, holes_played, quick_total, updated_at: now }
      : s,
  );
  if (!bundle.scores.some((s) => s.round_player_id === roundPlayerId)) {
    nextScores.push({
      id: `optimistic-score:${roundPlayerId}`,
      round_id: roundId,
      round_player_id: roundPlayerId,
      quick_total,
      holes_played,
      created_at: now,
      updated_at: now,
    });
  }

  return { ...bundle, holeScores: nextHoleScores, scores: nextScores };
}
