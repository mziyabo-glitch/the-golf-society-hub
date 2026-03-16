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
 * Reads from explicit snapshot fields first, fallback to legacy (tee_name, ladies_*).
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
        teeName: event.singleTeeName ?? event.teeName ?? "",
        par: event.singlePar ?? event.par ?? null,
        courseRating: event.singleCourseRating ?? event.courseRating ?? null,
        slopeRating: event.singleSlopeRating ?? event.slopeRating ?? null,
      },
      handicapAllowance,
    };
  }

  return {
    teeSetupMode: "separate",
    male: {
      teeName: event.maleTeeName ?? event.teeName ?? "",
      par: event.malePar ?? event.par ?? null,
      courseRating: event.maleCourseRating ?? event.courseRating ?? null,
      slopeRating: event.maleSlopeRating ?? event.slopeRating ?? null,
    },
    female: {
      teeName: event.femaleTeeName ?? event.ladiesTeeName ?? "",
      par: event.femalePar ?? event.ladiesPar ?? null,
      courseRating: event.femaleCourseRating ?? event.ladiesCourseRating ?? null,
      slopeRating: event.femaleSlopeRating ?? event.ladiesSlopeRating ?? null,
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
    event.singleTeeName || event.maleTeeName || event.teeName ||
    event.singlePar != null || event.malePar != null || event.par != null ||
    event.singleCourseRating != null || event.maleCourseRating != null || event.courseRating != null ||
    event.singleSlopeRating != null || event.maleSlopeRating != null || event.slopeRating != null ||
    event.femaleTeeName || event.ladiesTeeName ||
    event.femalePar != null || event.ladiesPar != null ||
    event.femaleCourseRating != null || event.ladiesCourseRating != null ||
    event.femaleSlopeRating != null || event.ladiesSlopeRating != null
  );
}
