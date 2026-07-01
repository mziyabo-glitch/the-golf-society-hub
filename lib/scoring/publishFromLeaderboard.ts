/**
 * Pure mapping from persisted gross leaderboard rows (see {@link getEventScoringLeaderboard})
 * to `event_results` inputs. OOM F1 tie averaging matches {@link getAveragedOOMPoints} in `oomMemberOnlyScoring`.
 */

import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import {
  dayValueForOomFromLeaderboardRow,
  getOomDaySortOrder,
  isOomPointsEvent,
} from "@/lib/oomEventClassification";
import {
  calculateFieldPositionsAndMemberOomPoints,
  isGuestEntrantKey,
} from "@/lib/oomMemberOnlyScoring";
import type { PublishOomEligibilityResolver } from "@/lib/oomPublishEligibility";
import { buildOomScoringDebugRows, logOomScoringBreakdown } from "@/lib/oomJointField";
import { buildMajorDayOomDebugRows, logMajorDayOomBreakdown, shouldUseMajorDayOomPipeline } from "@/lib/majorDayOomScoring";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import type { EventResultInput } from "@/lib/db_supabase/resultsRepo";

export type PublishOomEventMeta = {
  classification?: string | null;
  par?: number | null;
};

export function dayValueForPublishedResult(
  format: EventFormat,
  row: LeaderboardRow,
  meta?: PublishOomEventMeta,
): number {
  return dayValueForOomFromLeaderboardRow({
    format,
    classification: meta?.classification,
    stableford_points: row.stableford_points,
    net_total: row.net_total,
    par: meta?.par,
  });
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
  meta?: PublishOomEventMeta,
): EventResultInput[] {
  const complete = rows.filter((r) => r.round_complete);
  const sortOrder = getOomDaySortOrder(format, meta?.classification);

  let oomByPlayerId = new Map<string, number>();
  let dayPositionByPlayerId = new Map<string, number>();
  if (isOomEvent && complete.length > 0) {
    const entrants = complete.map((r) => ({
      memberId: r.player_id,
      dayPoints: String(dayValueForPublishedResult(format, r, meta)),
      isOomEligible: resolveOomEligible(r.player_id),
    }));
    const scored = calculateFieldPositionsAndMemberOomPoints(entrants, sortOrder);
    oomByPlayerId = new Map(scored.map((s) => [s.memberId, s.oomPoints]));
    dayPositionByPlayerId = new Map(
      scored.map((s) => [s.memberId, s.position ?? complete.find((r) => r.player_id === s.memberId)?.rank ?? 0]),
    );

    if (debugLabel) {
      const scoredRows = scored.map((s) => ({
        memberId: s.memberId,
        dayPoints: s.dayPoints,
        position: dayPositionByPlayerId.get(s.memberId) ?? s.position,
        oomPoints: s.oomPoints,
        isOomEligible: resolveOomEligible(s.memberId),
        tournamentPosition: complete.find((r) => r.player_id === s.memberId)?.rank ?? null,
      }));
      if (shouldUseMajorDayOomPipeline({ format, classification: meta?.classification, isOOM: true })) {
        logMajorDayOomBreakdown(
          debugLabel,
          buildMajorDayOomDebugRows(scoredRows, { format, classification: meta?.classification }),
          { format, sortOrder, scoringSource: "day_today_not_cumulative" },
        );
      } else {
        logOomScoringBreakdown(debugLabel, buildOomScoringDebugRows(scoredRows), { format, sortOrder });
      }
    }
  }

  return complete.map((r) => ({
    member_id: r.player_id,
    position: dayPositionByPlayerId.get(r.player_id) ?? r.rank,
    day_value: dayValueForPublishedResult(format, r, meta),
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
