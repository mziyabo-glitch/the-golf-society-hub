/**
 * Event-scoped course data for scoring (immutable snapshots + optional live tee for UI).
 * Lives in `types/` so scoring helpers can import without pulling Supabase / React Native.
 */

export type EventTeeRatingSnapshot = {
  teeName: string | null;
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
};

export type EventHoleSnapshotRow = {
  id: string;
  event_id: string;
  hole_number: number;
  par: number;
  yardage: number;
  stroke_index: number;
};

/** Subset of `course_tees` returned with {@link EventCourseContext} for labels / pickers. */
export type EventCourseLiveTee = {
  id: string;
  course_id: string;
  tee_name: string;
  tee_color?: string | null;
  course_rating: number;
  slope_rating: number;
  par_total: number;
  gender?: string | null;
  yards?: number | null;
  bogey_rating?: number | null;
  total_meters?: number | null;
  is_default?: boolean;
  display_order?: number;
};

export type EventCourseContext = {
  eventId: string;
  courseId: string | null;
  teeId: string | null;
  courseName: string | null;
  tee: EventCourseLiveTee | null;
  teeRatingSnapshot: EventTeeRatingSnapshot | null;
  holes: EventHoleSnapshotRow[];
  lockRow: { course_id: string; tee_id: string } | null;
};
