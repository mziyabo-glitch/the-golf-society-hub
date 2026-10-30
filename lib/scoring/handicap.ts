/**
 * World Handicap System style course handicap from index (playing conditions not applied here).
 * Used when converting handicap index to strokes for a specific rated tee.
 *
 * Formula: (handicapIndex × slope / 113) + (courseRating − par)
 */

export function calculateCourseHandicap(
  handicapIndex: number,
  slope: number,
  courseRating: number,
  par: number,
): number {
  if (!Number.isFinite(handicapIndex) || !Number.isFinite(slope) || !Number.isFinite(courseRating) || !Number.isFinite(par)) {
    throw new Error("calculateCourseHandicap: all arguments must be finite numbers.");
  }
  if (slope <= 0) {
    throw new Error("calculateCourseHandicap: slope must be positive.");
  }
  const raw = (handicapIndex * slope) / 113 + (courseRating - par);
  return Math.round(raw);
}
