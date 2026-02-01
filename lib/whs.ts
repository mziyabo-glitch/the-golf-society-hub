/**
 * WHS Handicap Calculation Utilities
 *
 * Implements World Handicap System formulas:
 * - Course Handicap (CH) = HI × (Slope ÷ 113) + (Course Rating − Par)
 * - Playing Handicap (PH) = CH × Handicap Allowance
 */

/**
 * Standard slope rating (neutral)
 */
export const STANDARD_SLOPE = 113;

/**
 * Default handicap allowance for individual stroke play (95%)
 */
export const DEFAULT_ALLOWANCE = 0.95;

/**
 * Tee settings required for handicap calculations
 */
export type TeeBlock = {
  par: number;
  courseRating: number;
  slopeRating: number;
};

/**
 * Calculate Course Handicap from Handicap Index and tee settings
 *
 * Formula: CH = HI × (Slope ÷ 113) + (Course Rating − Par)
 *
 * @param handicapIndex - Player's WHS Handicap Index (nullable)
 * @param tee - Tee block with par, courseRating, slopeRating
 * @returns Course Handicap rounded to nearest integer, or null if inputs missing
 */
export function calcCourseHandicap(
  handicapIndex: number | null | undefined,
  tee: TeeBlock | null | undefined
): number | null {
  // All inputs required
  if (handicapIndex == null || !tee) {
    return null;
  }

  if (tee.par == null || tee.courseRating == null || tee.slopeRating == null) {
    return null;
  }

  // CH = HI × (Slope ÷ 113) + (Course Rating − Par)
  const ch = handicapIndex * (tee.slopeRating / STANDARD_SLOPE) + (tee.courseRating - tee.par);

  // Round to nearest integer
  return Math.round(ch);
}

/**
 * Calculate Playing Handicap from Course Handicap and allowance
 *
 * Formula: PH = CH × Handicap Allowance
 *
 * @param courseHandicap - Calculated course handicap (nullable)
 * @param allowance - Handicap allowance (0.10-1.00), defaults to 0.95
 * @returns Playing Handicap rounded to nearest integer, or null if CH missing
 */
export function calcPlayingHandicap(
  courseHandicap: number | null | undefined,
  allowance: number = DEFAULT_ALLOWANCE
): number | null {
  if (courseHandicap == null) {
    return null;
  }

  // PH = CH × Allowance
  const ph = courseHandicap * allowance;

  // Round to nearest integer
  return Math.round(ph);
}

/**
 * Calculate both CH and PH in one call
 *
 * @param handicapIndex - Player's WHS Handicap Index
 * @param tee - Tee block for calculations
 * @param allowance - Handicap allowance (default 0.95)
 * @returns Object with courseHandicap and playingHandicap
 */
export function calcHandicaps(
  handicapIndex: number | null | undefined,
  tee: TeeBlock | null | undefined,
  allowance: number = DEFAULT_ALLOWANCE
): { courseHandicap: number | null; playingHandicap: number | null } {
  const courseHandicap = calcCourseHandicap(handicapIndex, tee);
  const playingHandicap = calcPlayingHandicap(courseHandicap, allowance);

  return { courseHandicap, playingHandicap };
}

/**
 * Format handicap value for display
 *
 * @param value - Handicap value (nullable)
 * @param decimals - Number of decimal places (default 0)
 * @returns Formatted string or "-" if null
 */
export function formatHandicap(
  value: number | null | undefined,
  decimals: number = 0
): string {
  if (value == null) return "-";
  return decimals > 0 ? value.toFixed(decimals) : String(value);
}

/**
 * Check if tee block has all required settings
 */
export function hasTeeSettings(tee: TeeBlock | null | undefined): boolean {
  if (!tee) return false;
  return tee.par != null && tee.courseRating != null && tee.slopeRating != null;
}

/**
 * Select appropriate tee block based on gender
 *
 * @param gender - Player's gender ('M', 'F', or null)
 * @param menTee - Men's tee settings
 * @param womenTee - Women's tee settings
 * @returns The appropriate tee block, or null if not available
 */
export function selectTeeByGender(
  gender: "M" | "F" | null | undefined,
  menTee: TeeBlock | null | undefined,
  womenTee: TeeBlock | null | undefined
): TeeBlock | null {
  // Female players use women's tee if available
  if (gender === "F" && hasTeeSettings(womenTee)) {
    return womenTee!;
  }

  // Default to men's tee
  if (hasTeeSettings(menTee)) {
    return menTee!;
  }

  // Fall back to women's tee if men's not available
  if (hasTeeSettings(womenTee)) {
    return womenTee!;
  }

  return null;
}
