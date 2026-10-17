import type { EventDoc } from "@/lib/db_supabase/eventRepo";

/** `YYYY-MM-DD` slice from stored event date, or null if missing / invalid. */
export function eventCalendarDateKey(date?: string | null): string | null {
  if (!date?.trim()) return null;
  const t = date.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Device-local calendar date (matchday UX). */
export function todayCalendarDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Today’s in-play event for the Scorecard tab: same calendar day, not marked completed.
 * If several, returns the first after sorting by name (stable, predictable).
 */
export function findTodayScorecardEvent(events: readonly EventDoc[]): EventDoc | null {
  const today = todayCalendarDateKey();
  const candidates = events.filter((e) => {
    if (e.isCompleted) return false;
    const key = eventCalendarDateKey(e.date);
    return key === today;
  });
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  return [...candidates].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))[0]!;
}

export function hasScorecardTabForSociety(events: readonly EventDoc[]): boolean {
  return findTodayScorecardEvent(events) != null;
}
