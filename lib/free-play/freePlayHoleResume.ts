import type { FreePlayRoundHoleScore } from "@/types/freePlayScorecard";

/**
 * First hole (in order) where the player has no numeric gross recorded.
 * Pickup/NR rows (`gross_strokes === null`) count as incomplete for navigation resume.
 */
export function findFirstIncompleteHoleNumber(
  holeOrder: readonly number[],
  holeScores: readonly FreePlayRoundHoleScore[],
  roundPlayerId: string,
): number | null {
  for (const n of holeOrder) {
    const row = holeScores.find((h) => h.round_player_id === roundPlayerId && h.hole_number === n);
    if (!row || row.gross_strokes == null || !Number.isFinite(Number(row.gross_strokes))) {
      return n;
    }
  }
  return null;
}
