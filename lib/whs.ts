/**
 * World Handicap System (WHS) calculation helpers
 */

import type { TeeSet } from "./models";

/**
 * Calculate Course Handicap from WHS Index
 * Formula: Course Handicap = round(Index × (Slope Rating ÷ 113) + (Course Rating − Par))
 */
export function calculateCourseHandicap(
  whsIndex: number,
  teeSet: TeeSet
): number {
  const courseHandicap =
    whsIndex * (teeSet.slopeRating / 113) + (teeSet.courseRating - teeSet.par);
  return Math.round(courseHandicap);
}

/**
 * Calculate Playing Handicap from Course Handicap
 * Formula: Playing Handicap = round(Course Handicap × Handicap Allowance)
 */
export function calculatePlayingHandicap(
  courseHandicap: number,
  handicapAllowance: 0.9 | 1.0
): number {
  return Math.round(courseHandicap * handicapAllowance);
}

/**
 * Calculate Playing Handicap directly from WHS Index
 * Convenience function that combines both calculations
 */
export function calculatePlayingHandicapFromIndex(
  whsIndex: number,
  teeSet: TeeSet,
  handicapAllowance: 0.9 | 1.0 = 1.0
): number {
  const courseHandicap = calculateCourseHandicap(whsIndex, teeSet);
  return calculatePlayingHandicap(courseHandicap, handicapAllowance);
}












