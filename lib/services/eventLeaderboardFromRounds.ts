import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

export type RoundSummaryInput = {
  player_id: string;
  gross_total: number;
  net_total: number;
  stableford_points: number;
  holes_played: number;
  course_handicap: number | null;
  playing_handicap: number | null;
};

/** Compare ranking metrics only (no `player_id`); used for tie groups and shared rank. */
function compareMetricsOnly(
  a: RoundSummaryInput,
  b: RoundSummaryInput,
  format: EventFormat,
  expectedHoles: number,
): number {
  const ac = a.holes_played >= expectedHoles;
  const bc = b.holes_played >= expectedHoles;
  if (ac !== bc) return ac ? -1 : 1;

  if (format === "stableford") {
    if (a.stableford_points !== b.stableford_points) return b.stableford_points - a.stableford_points;
  } else if (format === "strokeplay_net") {
    if (a.net_total !== b.net_total) return a.net_total - b.net_total;
  } else {
    if (a.gross_total !== b.gross_total) return a.gross_total - b.gross_total;
  }

  if (a.holes_played !== b.holes_played) return b.holes_played - a.holes_played;
  return 0;
}

/** Full sort order: metrics first, then `player_id` for deterministic ordering within a tie. */
function compareSortOrder(
  a: RoundSummaryInput,
  b: RoundSummaryInput,
  format: EventFormat,
  expectedHoles: number,
): number {
  const m = compareMetricsOnly(a, b, format, expectedHoles);
  if (m !== 0) return m;
  if (a.player_id < b.player_id) return -1;
  if (a.player_id > b.player_id) return 1;
  return 0;
}

function roundsEqualForRanking(a: RoundSummaryInput, b: RoundSummaryInput, format: EventFormat, expectedHoles: number): boolean {
  return compareMetricsOnly(a, b, format, expectedHoles) === 0;
}

/**
 * Build ordered leaderboard rows from persisted `event_player_rounds` summaries.
 * Complete rounds (holes_played >= expectedHoles) sort above incomplete; ties share rank.
 */
export function buildLeaderboardFromRoundSummaries(
  format: EventFormat,
  expectedHoles: number,
  rounds: readonly RoundSummaryInput[],
): LeaderboardRow[] {
  const sorted = [...rounds].sort((a, b) => compareSortOrder(a, b, format, expectedHoles));

  const out: LeaderboardRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && roundsEqualForRanking(sorted[i]!, sorted[j]!, format, expectedHoles)) {
      j++;
    }
    const tieSize = j - i;
    const rank = i + 1;
    for (let k = i; k < j; k++) {
      const r = sorted[k]!;
      const roundComplete = r.holes_played >= expectedHoles;
      out.push({
        player_id: r.player_id,
        rank,
        tie_size: tieSize,
        gross_total: r.gross_total,
        net_total: r.net_total,
        stableford_points: r.stableford_points,
        holes_played: r.holes_played,
        expected_holes: expectedHoles,
        round_complete: roundComplete,
        eligible_for_primary_rank: roundComplete,
        course_handicap: r.course_handicap,
        playing_handicap: r.playing_handicap,
      });
    }
    i = j;
  }
  return out;
}
