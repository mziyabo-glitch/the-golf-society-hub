/**
 * Pure mapping from persisted gross leaderboard rows (see {@link getEventScoringLeaderboard})
 * to `event_results` inputs. OOM F1 tie averaging matches {@link getAveragedOOMPoints} in `oomMemberOnlyScoring`.
 */

import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import type { OomFieldSortOrder } from "@/lib/oomMemberOnlyScoring";
import {
  calculateFieldPositionsAndMemberOomPoints,
  isGuestEntrantKey,
} from "@/lib/oomMemberOnlyScoring";
import type { PublishOomEligibilityResolver } from "@/lib/oomPublishEligibility";
import { buildOomScoringDebugRows, logOomScoringBreakdown } from "@/lib/oomJointField";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import type { EventResultInput } from "@/lib/db_supabase/resultsRepo";

function sortOrderForPublishedFormat(format: EventFormat): OomFieldSortOrder {
  return format === "stableford" ? "high_wins" : "low_wins";
}

export function dayValueForPublishedResult(format: EventFormat, row: LeaderboardRow): number {
  if (format === "stableford") return row.stableford_points;
  if (format === "strokeplay_net") return row.net_total;
  return row.gross_total;
}

function defaultPublishOomEligible(playerId: string): boolean {
  return !isGuestEntrantKey(playerId);
}

/**
 * Only **complete** rounds become official rows. Field positions come from stored leaderboard ranks
 * (standard competition ranking: shared rank, next rank skipped). OOM points use **member-only**
 * re-ranking: guests and non-active-society players keep field position but receive 0 OOM points.
 */
export function buildEventResultInputsFromLeaderboard(
  format: EventFormat,
  rows: readonly LeaderboardRow[],
  isOomEvent: boolean,
  resolveOomEligible: PublishOomEligibilityResolver = defaultPublishOomEligible,
  debugLabel?: string,
): EventResultInput[] {
  const complete = rows.filter((r) => r.round_complete);
  const sortOrder = sortOrderForPublishedFormat(format);

  let oomByPlayerId = new Map<string, number>();
  if (isOomEvent && complete.length > 0) {
    const entrants = complete.map((r) => ({
      memberId: r.player_id,
      dayPoints: String(dayValueForPublishedResult(format, r)),
      isOomEligible: resolveOomEligible(r.player_id),
    }));
    const scored = calculateFieldPositionsAndMemberOomPoints(entrants, sortOrder);
    oomByPlayerId = new Map(scored.map((s) => [s.memberId, s.oomPoints]));

    if (debugLabel) {
      logOomScoringBreakdown(
        debugLabel,
        buildOomScoringDebugRows(
          scored.map((s) => ({
            memberId: s.memberId,
            dayPoints: s.dayPoints,
            position: complete.find((r) => r.player_id === s.memberId)?.rank ?? s.position,
            oomPoints: s.oomPoints,
            isOomEligible: resolveOomEligible(s.memberId),
          })),
        ),
        { format, sortOrder },
      );
    }
  }

  return complete.map((r) => ({
    member_id: r.player_id,
    position: r.rank,
    day_value: dayValueForPublishedResult(format, r),
    points: isOomEvent ? (oomByPlayerId.get(r.player_id) ?? 0) : 0,
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
