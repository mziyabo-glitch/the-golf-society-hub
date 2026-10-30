/**
 * Canonical WHS tee ratings for De Vere Wokefield Park.
 * Source: WHS Course Handicap Calculator (golfhandicapcalculator.co), 2025–2026.
 */

export type WokefieldTeeRating = {
  teeName: string;
  gender: "M" | "F";
  courseRating: number;
  slopeRating: number;
  whsPar: number;
};

export const WOKEFIELD_PARK_COURSE_NAME = "Wokefield Park";

export const WOKEFIELD_PARK_ALIASES = [
  "Wokefield Park",
  "De Vere Wokefield Park",
  "De Vere Venues Wokefield Park",
];

/** Ratings validated at HI 20.5 (men's Black → CH 19; women's Black → 25, Red → 22). */
export const WOKEFIELD_PARK_TEE_RATINGS: readonly WokefieldTeeRating[] = [
  { teeName: "Black", gender: "M", courseRating: 69, slopeRating: 123, whsPar: 72 },
  { teeName: "Black", gender: "F", courseRating: 74.6, slopeRating: 129, whsPar: 73 },
  { teeName: "Red", gender: "F", courseRating: 72.5, slopeRating: 125, whsPar: 73 },
] as const;

export function wokefieldTeeDbName(rating: WokefieldTeeRating): string {
  return rating.gender === "F" ? `${rating.teeName} (Ladies)` : rating.teeName;
}

export function findWokefieldTeeRating(
  teeName: string,
  gender: "M" | "F" = "M",
): WokefieldTeeRating | undefined {
  const key = teeName.trim().toLowerCase().replace(/\s*\(ladies\)\s*/i, "");
  return WOKEFIELD_PARK_TEE_RATINGS.find(
    (t) => t.teeName.toLowerCase() === key && t.gender === gender,
  );
}
