import type { BirdiesLeagueRow } from "@/lib/db_supabase/birdiesLeagueRepo";

/**
 * Phase 2 feature visibility.
 *
 * Live gross scoring and Birdies League remain in the codebase and DB but are
 * hidden from normal navigation until product adoption justifies surfacing them.
 * Do not drop related tables in this phase.
 */

/**
 * Birdies League UI is deprecated pending a complete birdie-recording workflow
 * and valid result data. Set to true only when recording is shipped and standings
 * can be populated from real event results.
 */
export const BIRDIES_LEAGUE_UI_ENABLED = false;

/** Hide Birdies League home card when UI is off, or when there is no league/data. */
export function shouldShowBirdiesLeagueHomeCard(
  league: BirdiesLeagueRow | null | undefined,
  hasBirdieData: boolean,
): boolean {
  if (!BIRDIES_LEAGUE_UI_ENABLED) return false;
  if (!league) return false;
  if (!hasBirdieData) return false;
  return true;
}

/** True when Birdies League screens/shortcuts may appear in navigation. */
export function isBirdiesLeagueUiEnabled(): boolean {
  return BIRDIES_LEAGUE_UI_ENABLED;
}

/**
 * Live gross scoring is deprecated pending adoption.
 * Production currently has zero live rounds / hole scores.
 * Keep routes and tables; only show UI when the event flag is explicitly on.
 * Do not surface Scorecard tab, quick actions, or live leaderboard links unless
 * this returns true for the relevant event.
 */
export function isLiveGrossScoringEnabledForEvent(
  event:
    | { live_gross_scoring_enabled?: boolean | null; liveGrossScoringEnabled?: boolean | null }
    | null
    | undefined,
): boolean {
  return event?.live_gross_scoring_enabled === true || event?.liveGrossScoringEnabled === true;
}

/** Scorecard hub is only useful when today's event has live gross scoring enabled. */
export function shouldRedirectDeprecatedScorecardHub(
  todayEvent:
    | { live_gross_scoring_enabled?: boolean | null; liveGrossScoringEnabled?: boolean | null }
    | null
    | undefined,
): boolean {
  return !isLiveGrossScoringEnabledForEvent(todayEvent);
}
