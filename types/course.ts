/**
 * GolfCourseAPI + normalized course import types.
 * DB tables: `courses`, `course_tees`, `course_holes` (see Supabase migrations 049+113).
 * `event_courses` locks event ↔ imported tee for scoring pipelines (migration 113).
 */

/** Raw search hit shapes we have seen: root array, `{ courses: [] }`, `{ data: [] }`. */
export type GolfCourseApiSearchResponse =
  | GolfCourseApiSearchHit[]
  | { courses?: unknown[]; data?: unknown[]; results?: unknown[] }
  | Record<string, unknown>;

export type GolfCourseApiSearchHit = {
  id: number;
  /** Display name from API (may duplicate course_name). */
  name?: string;
  course_name?: string;
  club_name?: string;
  club?: string;
  location?: string | Record<string, unknown>;
  city?: string;
  country?: string;
  region?: string;
  address?: string | Record<string, unknown>;
};

/** Single hole from API (field names vary). */
export type GolfCourseApiHole = {
  hole_number?: number;
  number?: number;
  par?: number;
  yardage?: number;
  yards?: number;
  handicap?: number;
  stroke_index?: number;
  strokeIndex?: number;
  hcp?: number;
  si?: number;
};

export type GolfCourseApiTee = {
  id?: number | string;
  name?: string;
  tee_name?: string;
  tee_color?: string;
  course_rating?: number;
  bogey_rating?: number;
  slope_rating?: number;
  par_total?: number;
  par?: number;
  total_yards?: number;
  yards?: number;
  yardage?: number;
  total_meters?: number;
  meters?: number;
  gender?: string;
  holes?: GolfCourseApiHole[];
};

export type GolfCourseApiTeeBuckets = {
  male?: GolfCourseApiTee[];
  female?: GolfCourseApiTee[];
  men?: GolfCourseApiTee[];
  women?: GolfCourseApiTee[];
  ladies?: GolfCourseApiTee[];
};

/** Full course payload from GET /courses/{id} (after wrapper unwrap). */
export type GolfCourseApiCourse = {
  id: number;
  name?: string;
  course_name?: string;
  club_name?: string;
  club?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  address?: string | Record<string, unknown>;
  city?: string;
  country?: string;
  location?: string | Record<string, unknown>;
  tees?: GolfCourseApiTee[] | GolfCourseApiTeeBuckets;
};

/** Flattened + coerced values ready for `course_tees` / `course_holes` rows. */
export type NormalizedHole = {
  holeNumber: number;
  par: number | null;
  yardage: number | null;
  strokeIndex: number | null;
};

export type NormalizedTee = {
  teeName: string;
  gender: "M" | "F" | null;
  /** Which API bucket this tee came from (audit). */
  apiSourceGroup: "male" | "female" | "unisex";
  courseRating: number | null;
  bogeyRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
  totalYards: number | null;
  totalMeters: number | null;
  teeColor: string | null;
  isDefault: boolean;
  displayOrder: number;
  holes: NormalizedHole[];
};

export type NormalizedCourse = {
  apiId: number;
  clubName: string | null;
  courseName: string;
  fullName: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  dedupeKey: string;
  normalizedNameKey: string;
  source: "golfcourseapi";
};

export type NormalizedCourseImport = {
  course: NormalizedCourse;
  tees: Array<{ tee: NormalizedTee; holes: NormalizedHole[] }>;
};

/** Importer result after persistence (UUIDs from Supabase). */
/** UI / event flow result after a successful import (stable Supabase UUIDs). */
export type ImportedTee = {
  id: string;
  teeName: string;
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
  gender?: string | null;
  yards?: number | null;
};

export type ImportedCourse = {
  courseId: string;
  courseName: string;
  tees: ImportedTee[];
  /** True when data was freshly written or re-read from DB after import. */
  imported: boolean;
};

/** Populated after GolfCourseAPI import persistence + tee reconciliation (migration 118+). */
export type TeeImportReconciliationStats = {
  normalizedTeeCount: number;
  /** All `course_tees` rows for the course immediately before stale cleanup. */
  dbTeeCountBeforeReconciliation: number;
  /** Stale rows still referenced by events / event_courses / event_entries — soft-deactivated only. */
  staleDeactivatedCount: number;
  /** Stale rows with no downstream references — removed from `course_tees`. */
  staleDeletedCount: number;
  /** Same as staleDeactivatedCount (audit alias). */
  historicalReferencedStaleCount: number;
  /** Rows with is_active=true after reconciliation (picker / scoring surface). */
  dbActiveTeeCountAfter: number;
};

export type PersistedCourseImport = {
  courseId: string;
  apiId: number;
  courseName: string;
  teeCount: number;
  holeCount: number;
  tees: Array<{
    id: string;
    teeName: string;
    holeCount: number;
    courseRating: number | null;
    slopeRating: number | null;
    parTotal: number | null;
    gender?: string | null;
    yards?: number | null;
  }>;
  teeReconciliation?: TeeImportReconciliationStats;
};
