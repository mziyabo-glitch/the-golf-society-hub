import type { EventDoc } from "@/lib/db_supabase/eventRepo";

function startOfTodayLocalMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function eventDateStartMs(date?: string | null): number | null {
  if (!date?.trim()) return null;
  const ms = new Date(date.trim()).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * UI timeline: past if the event is marked completed, or its calendar date is before local today.
 * Events with no date and not completed count as upcoming (TBD).
 */
export function isEventPastForList(e: Pick<EventDoc, "isCompleted" | "date">): boolean {
  if (e.isCompleted) return true;
  const ms = eventDateStartMs(e.date ?? undefined);
  if (ms === null) return false;
  return ms < startOfTodayLocalMs();
}

export function partitionUpcomingPast(events: EventDoc[]): { upcoming: EventDoc[]; past: EventDoc[] } {
  const upcoming = events.filter((ev) => !isEventPastForList(ev));
  const past = events.filter((ev) => isEventPastForList(ev));
  return { upcoming, past };
}

function compareUpcoming(a: EventDoc, b: EventDoc): number {
  const ma = eventDateStartMs(a.date ?? undefined) ?? Number.MAX_SAFE_INTEGER;
  const mb = eventDateStartMs(b.date ?? undefined) ?? Number.MAX_SAFE_INTEGER;
  if (ma !== mb) return ma - mb;
  return String(a.id).localeCompare(String(b.id));
}

function comparePast(a: EventDoc, b: EventDoc): number {
  const ma = eventDateStartMs(a.date ?? undefined) ?? Number.MIN_SAFE_INTEGER;
  const mb = eventDateStartMs(b.date ?? undefined) ?? Number.MIN_SAFE_INTEGER;
  if (ma !== mb) return mb - ma;
  return String(b.id).localeCompare(String(a.id));
}

/** Nearest-first (unknown dates last). */
export function sortUpcomingNearestFirst(events: EventDoc[]): EventDoc[] {
  return [...events].sort(compareUpcoming);
}

/** Most-recent-first (unknown dates last among past). */
export function sortPastMostRecentFirst(events: EventDoc[]): EventDoc[] {
  return [...events].sort(comparePast);
}
