import type { BirdiesLeagueRow } from '@/lib/db_supabase/birdiesLeagueRepo';

/** Hide Birdies League home card when there is no active league or no recorded birdie data. */
export function shouldShowBirdiesLeagueHomeCard(
  league: BirdiesLeagueRow | null | undefined,
  hasBirdieData: boolean
): boolean {
  if (!league) return false;
  if (!hasBirdieData) return false;
  return true;
}

/** Live gross scoring UI only when explicitly enabled on the event. */
export function isLiveGrossScoringEnabledForEvent(
  event:
    | { live_gross_scoring_enabled?: boolean | null; liveGrossScoringEnabled?: boolean | null }
    | null
    | undefined,
): boolean {
  return event?.live_gross_scoring_enabled === true || event?.liveGrossScoringEnabled === true;
}
