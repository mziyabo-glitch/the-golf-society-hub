import type { EventClassification, EventDoc } from "@/lib/db_supabase/eventRepo";

export type BirdiesLeagueEventScope = "all_official" | "oom_only";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Sort key: dated events first (ascending), then undated, then name + id. */
export function compareEventsForBirdiesLeague(a: EventDoc, b: EventDoc): number {
  const da = a.date?.trim() && DATE_RE.test(a.date.trim()) ? a.date!.trim() : "\uFFFF";
  const db = b.date?.trim() && DATE_RE.test(b.date.trim()) ? b.date!.trim() : "\uFFFF";
  if (da !== db) return da.localeCompare(db);
  const na = (a.name || "").localeCompare(b.name || "");
  if (na !== 0) return na;
  return a.id.localeCompare(b.id);
}

/** True when `e` is the same as or after `anchor` in the society schedule ordering. */
export function isEventOnOrAfterBirdiesAnchor(anchor: EventDoc, e: EventDoc): boolean {
  return compareEventsForBirdiesLeague(anchor, e) <= 0;
}

function classificationValue(ev: EventDoc): EventClassification {
  return (ev.classification ?? "general") as EventClassification;
}

/** Non-friendly society competitions (general, OOM, major). */
export function isAllOfficialBirdiesScopeEvent(ev: EventDoc): boolean {
  return classificationValue(ev) !== "friendly";
}

export function isOomBirdiesScopeEvent(ev: EventDoc): boolean {
  if (ev.isOOM === true) return true;
  const c = classificationValue(ev);
  return c === "oom" || String(c).toLowerCase() === "oom";
}

export function matchesBirdiesLeagueEventScope(ev: EventDoc, scope: BirdiesLeagueEventScope): boolean {
  if (scope === "oom_only") return isOomBirdiesScopeEvent(ev);
  return isAllOfficialBirdiesScopeEvent(ev);
}

/** Next unplayed (`!isCompleted`) event matching scope, by schedule order. */
export function findNextUnplayedEligibleBirdiesEvent(
  events: EventDoc[],
  scope: BirdiesLeagueEventScope,
): EventDoc | null {
  const candidates = events
    .filter((e) => !e.isCompleted)
    .filter((e) => matchesBirdiesLeagueEventScope(e, scope))
    .sort(compareEventsForBirdiesLeague);
  return candidates[0] ?? null;
}

/** Completed events that count toward the league (on/after start, matching scope). */
export function eligibleCompletedBirdiesEventIds(
  events: EventDoc[],
  scope: BirdiesLeagueEventScope,
  startEvent: EventDoc,
): string[] {
  return events
    .filter((e) => e.isCompleted)
    .filter((e) => matchesBirdiesLeagueEventScope(e, scope))
    .filter((e) => isEventOnOrAfterBirdiesAnchor(startEvent, e))
    .sort(compareEventsForBirdiesLeague)
    .map((e) => e.id);
}
