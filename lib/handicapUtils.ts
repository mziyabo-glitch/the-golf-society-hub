/**
 * WHS Handicap Calculation Utilities
 *
 * Formulas:
 * - Course Handicap (CH) = HI × (Slope ÷ 113) + (Course Rating − Par)
 * - Playing Handicap (PH) = CH × Handicap Allowance
 *
 * Standard handicap allowances:
 * - Individual stroke play: 95% (0.95)
 * - Individual stableford: 95% (0.95)
 * - Fourball better ball: 85% (0.85)
 * - Foursomes: 50% (0.50) combined
 */

export type TeeSettings = {
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  handicapAllowance?: number | null;
};

export type HandicapResult = {
  handicapIndex: number | null;
  courseHandicap: number | null;
  playingHandicap: number | null;
};

/**
 * Standard slope rating (neutral)
 */
export const STANDARD_SLOPE = 113;

/**
 * Default handicap allowance for individual stroke play
 */
export const DEFAULT_HANDICAP_ALLOWANCE = 0.95;

/**
 * Calculate Course Handicap from Handicap Index and tee settings
 *
 * Formula: CH = HI × (Slope ÷ 113) + (Course Rating − Par)
 *
 * @param handicapIndex - Player's WHS Handicap Index
 * @param slopeRating - Tee slope rating (55-155)
 * @param courseRating - Tee course rating
 * @param par - Course par
 * @returns Course Handicap rounded to nearest integer, or null if inputs missing
 */
export function calculateCourseHandicap(
  handicapIndex: number | null | undefined,
  slopeRating: number | null | undefined,
  courseRating: number | null | undefined,
  par: number | null | undefined
): number | null {
  // All inputs required
  if (
    handicapIndex == null ||
    slopeRating == null ||
    courseRating == null ||
    par == null
  ) {
    return null;
  }

  // CH = HI × (Slope ÷ 113) + (Course Rating − Par)
  const ch = handicapIndex * (slopeRating / STANDARD_SLOPE) + (courseRating - par);

  // Round to nearest integer
  return Math.round(ch);
}

/**
 * Calculate Playing Handicap from Course Handicap and allowance
 *
 * Formula: PH = CH × Handicap Allowance
 *
 * @param courseHandicap - Calculated course handicap
 * @param handicapAllowance - Allowance (0.10-1.00), defaults to 0.95
 * @returns Playing Handicap rounded to nearest integer, or null if inputs missing
 */
export function calculatePlayingHandicap(
  courseHandicap: number | null | undefined,
  handicapAllowance?: number | null
): number | null {
  if (courseHandicap == null) {
    return null;
  }

  const allowance = handicapAllowance ?? DEFAULT_HANDICAP_ALLOWANCE;

  // PH = CH × Allowance
  const ph = courseHandicap * allowance;

  // Round to nearest integer
  return Math.round(ph);
}

/**
 * Calculate both Course Handicap and Playing Handicap
 *
 * @param handicapIndex - Player's WHS Handicap Index
 * @param teeSettings - Tee settings with par, courseRating, slopeRating, and optional handicapAllowance
 * @returns Object with handicapIndex, courseHandicap, and playingHandicap
 */
export function calculateHandicaps(
  handicapIndex: number | null | undefined,
  teeSettings: TeeSettings | null | undefined
): HandicapResult {
  if (!teeSettings) {
    return {
      handicapIndex: handicapIndex ?? null,
      courseHandicap: null,
      playingHandicap: null,
    };
  }

  const courseHandicap = calculateCourseHandicap(
    handicapIndex,
    teeSettings.slopeRating,
    teeSettings.courseRating,
    teeSettings.par
  );

  const playingHandicap = calculatePlayingHandicap(
    courseHandicap,
    teeSettings.handicapAllowance
  );

  return {
    handicapIndex: handicapIndex ?? null,
    courseHandicap,
    playingHandicap,
  };
}

/**
 * Format a handicap value for display
 * Shows one decimal place for HI, integers for CH/PH
 *
 * @param value - Handicap value
 * @param isIndex - True if this is a Handicap Index (show decimal)
 * @returns Formatted string or "-" if null
 */
export function formatHandicap(
  value: number | null | undefined,
  isIndex: boolean = false
): string {
  if (value == null) return "-";

  if (isIndex) {
    // HI typically shown with one decimal
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }

  // CH and PH are integers
  return value >= 0 ? `+${value}` : value.toString();
}

/**
 * Format handicap index for display (without + sign for positive)
 */
export function formatHandicapIndex(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toFixed(1);
}

/**
 * Check if tee settings are complete enough for handicap calculations
 */
export function hasTeeSettings(teeSettings: TeeSettings | null | undefined): boolean {
  if (!teeSettings) return false;

  return (
    teeSettings.par != null &&
    teeSettings.courseRating != null &&
    teeSettings.slopeRating != null
  );
}

/**
 * Get recommended handicap allowance for a format
 */
export function getRecommendedAllowance(format: string | undefined): number {
  if (!format) return DEFAULT_HANDICAP_ALLOWANCE;

  const normalized = format.toLowerCase();

  // Fourball formats: 85%
  if (normalized.includes("fourball") || normalized.includes("better_ball")) {
    return 0.85;
  }

  // Foursomes: 50% (combined)
  if (normalized.includes("foursomes")) {
    return 0.50;
  }

  // Scramble formats: typically lower
  if (normalized.includes("scramble")) {
    return 0.75;
  }

  // Default for individual play: 95%
  return DEFAULT_HANDICAP_ALLOWANCE;
}
