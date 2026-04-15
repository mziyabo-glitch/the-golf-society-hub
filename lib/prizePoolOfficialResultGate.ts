import type { EventPrizePoolEntryRow } from "@/lib/event-prize-pools-types";
import type { EventResultDoc } from "@/lib/db_supabase/resultsRepo";

/**
 * Prize pool payout uses Pot Master–confirmed entrants who also have an official
 * `event_results` row with a scored `day_value` (same source as the points screen).
 */
export function confirmedPrizePoolEntryHasOfficialScoredResult(
  entry: EventPrizePoolEntryRow,
  resultByMemberId: Map<string, EventResultDoc>,
  resultBySocietyGuestKey: Map<string, EventResultDoc>,
  societyScope: string,
  options?: {
    requireDetailedSplitterFields?: boolean;
  },
): boolean {
  const requireDetailed = options?.requireDetailedSplitterFields === true;
  if (!entry.confirmed_by_pot_master) return false;

  if (entry.participant_type === "member" && entry.member_id) {
    const pick = resultByMemberId.get(String(entry.member_id));
    if (!pick || pick.day_value == null) return false;
    if (!requireDetailed) return true;
    return pick.front_9_value != null && pick.back_9_value != null && pick.birdie_count != null;
  }

  if (entry.participant_type === "guest" && entry.guest_id) {
    const gid = String(entry.guest_id);
    const pick = resultBySocietyGuestKey.get(`${societyScope}:${gid}`);
    if (!pick || pick.day_value == null) return false;
    if (!requireDetailed) return true;
    return pick.front_9_value != null && pick.back_9_value != null && pick.birdie_count != null;
  }

  return false;
}
