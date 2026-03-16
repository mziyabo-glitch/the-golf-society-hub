/**
 * Event tee snapshot — single source of truth for event tee display.
 * No DB/API calls. Renders from event's persisted fields only.
 */
import type { EventDoc } from "@/lib/db_supabase/eventRepo";

export type TeeSetupMode = "single" | "separate";

export type EventTeeSnapshot = {
  teeSetupMode: TeeSetupMode;
  /** Single mode: one tee for all */
  single?: {
    teeName: string;
    par: number | null;
    courseRating: number | null;
    slopeRating: number | null;
  };
  /** Separate mode: male and female tees */
  male?: {
    teeName: string;
    par: number | null;
    courseRating: number | null;
    slopeRating: number | null;
  };
  female?: {
    teeName: string;
    par: number | null;
    courseRating: number | null;
    slopeRating: number | null;
  };
  handicapAllowance: number | null;
};

/**
 * Build tee display snapshot from event. Pure function, no I/O.
 */
export function buildTeeSnapshotFromEvent(event: EventDoc | null): EventTeeSnapshot | null {
  if (!event) return null;

  const mode: TeeSetupMode =
    (event.teeSetupMode as TeeSetupMode) ??
    (event.teeName && event.ladiesTeeName && event.teeName !== event.ladiesTeeName ? "separate" : "single");

  const handicapAllowance = event.handicapAllowance ?? null;

  if (mode === "single") {
    return {
      teeSetupMode: "single",
      single: {
        teeName: event.teeName ?? "",
        par: event.par ?? null,
        courseRating: event.courseRating ?? null,
        slopeRating: event.slopeRating ?? null,
      },
      handicapAllowance,
    };
  }

  return {
    teeSetupMode: "separate",
    male: {
      teeName: event.teeName ?? "",
      par: event.par ?? null,
      courseRating: event.courseRating ?? null,
      slopeRating: event.slopeRating ?? null,
    },
    female: {
      teeName: event.ladiesTeeName ?? "",
      par: event.ladiesPar ?? null,
      courseRating: event.ladiesCourseRating ?? null,
      slopeRating: event.ladiesSlopeRating ?? null,
    },
    handicapAllowance,
  };
}

/**
 * Check if event has any saved tee data.
 */
export function hasTeeSnapshot(event: EventDoc | null): boolean {
  if (!event) return false;
  return !!(
    event.teeName ||
    event.par != null ||
    event.courseRating != null ||
    event.slopeRating != null ||
    event.ladiesTeeName ||
    event.ladiesPar != null ||
    event.ladiesCourseRating != null ||
    event.ladiesSlopeRating != null
  );
}
