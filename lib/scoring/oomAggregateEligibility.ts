/**
 * Which `event_results` rows count toward Order-of-Merit aggregates.
 *
 * - **Published gross path:** OOM points are written on publish; only `scoring_results_status = 'published'` counts.
 * - **Legacy manual path:** no rows in `event_player_rounds` → treat as manual results and keep counting while status is draft/reopened.
 * - **Gross path not yet published:** rows exist in `event_player_rounds` but status is not published → exclude (avoids stale manual rows affecting OOM before publish).
 */

import { isOfficialScoringPublished, parseEventScoringResultsStatus } from "@/lib/scoring/eventScoringPublishStatus";

export function includeEventResultsInOomAggregate(input: {
  scoringResultsStatusRaw: unknown;
  eventHasPersistedGrossRounds: boolean;
}): boolean {
  const status = parseEventScoringResultsStatus(input.scoringResultsStatusRaw);
  if (isOfficialScoringPublished(status)) return true;
  if (!input.eventHasPersistedGrossRounds) return true;
  return false;
}

export function buildOomEligibleEventIdSet(
  events: readonly { id: string; scoring_results_status?: unknown }[],
  eventIdsWithGrossRoundRows: ReadonlySet<string>,
): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (
      includeEventResultsInOomAggregate({
        scoringResultsStatusRaw: e.scoring_results_status,
        eventHasPersistedGrossRounds: eventIdsWithGrossRoundRows.has(e.id),
      })
    ) {
      out.add(e.id);
    }
  }
  return out;
}
