/**
 * Pre-flight checks before score entry. Uses immutable event course + hole snapshots only.
 * Default deps use dynamic import so Vitest suites can import this module without loading React Native.
 */

import type { EventCourseContext, EventHoleSnapshotRow, EventTeeRatingSnapshot } from "@/types/eventCourseScoring";
import { getEventScoringMode, normalizeEventFormat } from "@/lib/scoring/eventFormat";

/** Minimal event fields needed for readiness (matches {@link import("@/lib/db_supabase/eventRepo").EventDoc} subset). */
export type EventScoringReadinessEvent = {
  format?: string | null;
  courseId?: string | null;
  teeId?: string | null;
};

export type EventScoringReadinessDeps = {
  getEvent: (eventId: string) => Promise<EventScoringReadinessEvent | null>;
  getEventCourseContext: (eventId: string) => Promise<EventCourseContext | null>;
};

/** Validate rows that will be stored or read from `event_course_holes` (pure, testable). */
export function validateEventHoleSnapshotSet(holes: EventHoleSnapshotRow[]): string[] {
  const issues: string[] = [];
  const n = holes.length;
  if (n !== 9 && n !== 18) {
    issues.push(`Hole snapshot must have 9 or 18 rows; got ${n}.`);
    return issues;
  }
  const seen = new Set<number>();
  for (const h of holes) {
    if (!Number.isInteger(h.hole_number) || h.hole_number < 1 || h.hole_number > 18) {
      issues.push(`Invalid hole_number: ${h.hole_number}`);
    }
    if (seen.has(h.hole_number)) issues.push(`Duplicate hole_number in snapshot: ${h.hole_number}`);
    seen.add(h.hole_number);
    if (!Number.isFinite(h.par) || !Number.isInteger(h.par) || h.par < 3 || h.par > 5) {
      issues.push(`Hole ${h.hole_number}: invalid par ${h.par}`);
    }
    if (!Number.isFinite(h.yardage) || !Number.isInteger(h.yardage) || h.yardage < 1) {
      issues.push(`Hole ${h.hole_number}: invalid yardage ${h.yardage}`);
    }
    if (!Number.isFinite(h.stroke_index) || !Number.isInteger(h.stroke_index) || h.stroke_index < 1 || h.stroke_index > 18) {
      issues.push(`Hole ${h.hole_number}: invalid stroke_index ${h.stroke_index}`);
    }
  }
  return issues;
}

function teeSnapshotIssues(s: EventTeeRatingSnapshot | null): string[] {
  const issues: string[] = [];
  if (!s) {
    issues.push("Missing tee rating snapshot (event_courses row incomplete).");
    return issues;
  }
  if (s.courseRating == null || !Number.isFinite(s.courseRating)) issues.push("Tee snapshot: course_rating missing.");
  if (s.slopeRating == null || !Number.isFinite(s.slopeRating) || s.slopeRating <= 0) issues.push("Tee snapshot: slope_rating missing or invalid.");
  if (s.parTotal == null || !Number.isFinite(s.parTotal)) issues.push("Tee snapshot: par_total missing.");
  return issues;
}

/**
 * Throws if the event cannot be scored using immutable snapshot data alone.
 * Pass `deps` in tests to avoid loading Supabase / React Native graph.
 */
export async function assertEventScoringReady(
  eventId: string,
  deps: Partial<EventScoringReadinessDeps> = {},
): Promise<void> {
  const errors: string[] = [];

  const getEv =
    deps.getEvent ??
    ((await import("@/lib/db_supabase/eventRepo")).getEvent as EventScoringReadinessDeps["getEvent"]);
  const getCtx =
    deps.getEventCourseContext ??
    ((await import("@/lib/db_supabase/courseRepo")).getEventCourseContext as EventScoringReadinessDeps["getEventCourseContext"]);

  const ev = await getEv(eventId);
  if (!ev) {
    throw new Error(`assertEventScoringReady: event ${eventId} not found.`);
  }

  try {
    const rawFormat = ev.format ?? "";
    normalizeEventFormat(rawFormat);
    getEventScoringMode(rawFormat);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  if (!ev.courseId || !ev.teeId) {
    errors.push("Event is missing course_id or tee_id.");
  }

  const ctx = await getCtx(eventId);
  if (!ctx) {
    errors.push("Could not load event course context.");
  } else {
    errors.push(...teeSnapshotIssues(ctx.teeRatingSnapshot));
    errors.push(...validateEventHoleSnapshotSet(ctx.holes));
  }

  if (errors.length) {
    throw new Error(`Event not ready for scoring:\n- ${errors.join("\n- ")}`);
  }
}
