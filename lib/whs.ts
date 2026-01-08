/**
 * World Handicap System (WHS) calculation helpers
 * 
 * WHS Formula:
 * Course Handicap = Handicap Index × (Slope Rating / 113) + (Course Rating − Par)
 * Playing Handicap = round(Course Handicap × Allowance)
 */

import type { TeeSet } from "./models";

/**
 * Validate tee set has all required WHS values
 */
export function validateTeeSet(teeSet: TeeSet | null | undefined): { valid: boolean; error?: string } {
  if (!teeSet) {
    return { valid: false, error: "Tee set is required" };
  }
  if (typeof teeSet.slopeRating !== "number" || teeSet.slopeRating <= 0) {
    return { valid: false, error: "Invalid slope rating" };
  }
  if (typeof teeSet.courseRating !== "number" || teeSet.courseRating <= 0) {
    return { valid: false, error: "Invalid course rating" };
  }
  if (typeof teeSet.par !== "number" || teeSet.par <= 0) {
    return { valid: false, error: "Invalid par" };
  }
  return { valid: true };
}

/**
 * Calculate Course Handicap from WHS Index
 * Formula: Course Handicap = Index × (Slope Rating ÷ 113) + (Course Rating − Par)
 * 
 * @param whsIndex - Player's WHS Handicap Index
 * @param teeSet - The tee set being played
 * @returns Course Handicap (rounded) or null if inputs invalid
 */
export function calculateCourseHandicap(
  whsIndex: number | undefined,
  teeSet: TeeSet | null | undefined
): number | null {
  // Validate inputs
  if (whsIndex === undefined || whsIndex === null) {
    return null;
  }
  
  const validation = validateTeeSet(teeSet);
  if (!validation.valid || !teeSet) {
    return null;
  }

  // WHS Formula: CH = HI × (SR / 113) + (CR − Par)
  const courseHandicap =
    whsIndex * (teeSet.slopeRating / 113) + (teeSet.courseRating - teeSet.par);
  
  return Math.round(courseHandicap);
}

/**
 * Calculate Playing Handicap from Course Handicap
 * Formula: Playing Handicap = round(Course Handicap × Handicap Allowance)
 * 
 * @param courseHandicap - Calculated course handicap
 * @param allowancePercent - Handicap allowance as percentage (0-100), default 100%
 * @returns Playing Handicap (rounded)
 */
export function calculatePlayingHandicap(
  courseHandicap: number | null,
  allowancePercent: number = 100
): number | null {
  if (courseHandicap === null) {
    return null;
  }
  
  // Convert percentage to decimal (e.g., 90 -> 0.9)
  const allowance = allowancePercent / 100;
  return Math.round(courseHandicap * allowance);
}

/**
 * Calculate Playing Handicap directly from WHS Index
 * Combines both calculations for convenience
 * 
 * @param whsIndex - Player's WHS Handicap Index
 * @param teeSet - The tee set being played
 * @param allowancePercent - Handicap allowance as percentage (0-100), default 100%
 * @returns Playing Handicap (rounded) or null if inputs invalid
 */
export function calculatePlayingHandicapFromIndex(
  whsIndex: number | undefined,
  teeSet: TeeSet | null | undefined,
  allowancePercent: number = 100
): number | null {
  const courseHandicap = calculateCourseHandicap(whsIndex, teeSet);
  if (courseHandicap === null) {
    return null;
  }
  return calculatePlayingHandicap(courseHandicap, allowancePercent);
}

/**
 * WHS Calculation Result with full breakdown
 */
export interface WHSCalculationResult {
  handicapIndex: number;
  courseHandicap: number;
  playingHandicap: number;
  allowancePercent: number;
  teeSet: {
    color: string;
    slopeRating: number;
    courseRating: number;
    par: number;
  };
}

/**
 * Calculate full WHS breakdown for a player
 * Returns all intermediate values for display/debugging
 */
export function calculateWHSBreakdown(
  whsIndex: number | undefined,
  teeSet: TeeSet | null | undefined,
  allowancePercent: number = 100
): WHSCalculationResult | null {
  if (whsIndex === undefined || !teeSet) {
    return null;
  }

  const validation = validateTeeSet(teeSet);
  if (!validation.valid) {
    return null;
  }

  const courseHandicap = calculateCourseHandicap(whsIndex, teeSet);
  if (courseHandicap === null) {
    return null;
  }

  const playingHandicap = calculatePlayingHandicap(courseHandicap, allowancePercent);
  if (playingHandicap === null) {
    return null;
  }

  return {
    handicapIndex: whsIndex,
    courseHandicap,
    playingHandicap,
    allowancePercent,
    teeSet: {
      color: teeSet.teeColor,
      slopeRating: teeSet.slopeRating,
      courseRating: teeSet.courseRating,
      par: teeSet.par,
    },
  };
}

























