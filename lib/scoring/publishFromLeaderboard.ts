/**
 * Pure mapping from persisted gross leaderboard rows (see {@link getEventScoringLeaderboard})
 * to `event_results` inputs. OOM F1 tie averaging matches {@link getAveragedOOMPoints} in `oomMemberOnlyScoring`.
 */

import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import { getAveragedOOMPoints } from "@/lib/oomMemberOnlyScoring";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import type { EventResultInput } from "@/lib/db_supabase/resultsRepo";

export function dayValueForPublishedResult(format: EventFormat, row: LeaderboardRow): number {
  if (format === "stableford") return row.stableford_points;
  if (format === "strokeplay_net") return row.net_total;
  return row.gross_total;
}

/**
 * Only **complete** rounds become official rows. Positions and `tie_size` come from stored summaries
 * (standard competition ranking: shared rank, next rank skipped).
 */
export function buildEventResultInputsFromLeaderboard(
  format: EventFormat,
  rows: readonly LeaderboardRow[],
  isOomEvent: boolean,
): EventResultInput[] {
  const complete = rows.filter((r) => r.round_complete);
  return complete.map((r) => ({
    member_id: r.player_id,
    position: r.rank,
    day_value: dayValueForPublishedResult(format, r),
    points: isOomEvent ? getAveragedOOMPoints(r.rank, r.tie_size) : 0,
  }));
}

/** Publish requires at least one complete card so official standings are meaningful. */
export function validateScoringPublishReadiness(
  rows: readonly LeaderboardRow[],
  _ctx: EventScoringContext,
): string[] {
  const issues: string[] = [];
  const complete = rows.filter((r) => r.round_complete);
  if (complete.length === 0) {
    issues.push("At least one player must have a complete round (all holes scored) before publishing.");
  }
  return issues;
}
