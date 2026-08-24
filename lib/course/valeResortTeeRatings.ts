/**
 * Canonical WHS tee ratings for The Vale Resort sub-courses.
 * Source: official Vale Resort scorecards (2024–2026).
 * Used by scripts/seed-vale-resort.ts and handicap regression tests.
 */

export type ValeTeeRating = {
  teeName: string;
  gender: "M";
  courseRating: number;
  slopeRating: number;
  /** WHS par used for course handicap calculation (may differ from summed hole par on forward tees). */
  whsPar: number;
};

export const VALE_WALES_NATIONAL_COURSE_NAME = "Vale Resort – Wales National Course";
export const VALE_LAKE_COURSE_NAME = "Vale Resort – Lake Course";

/** Alternate names used by official PDF import rows — kept for dedupe / migration lookups. */
export const VALE_WALES_NATIONAL_ALIASES = [
  "Vale Resort – Wales National Course",
  "Vale Resort - Wales National Course",
  "The Vale Resort - Wales National Course",
  "The Vale Resort – Wales National Course",
];

export const VALE_LAKE_COURSE_ALIASES = [
  "Vale Resort – Lake Course",
  "Vale Resort - Lake Course",
  "The Vale Resort - Lake Course",
  "The Vale Resort – Lake Course",
];

export const VALE_WALES_NATIONAL_TEE_RATINGS: readonly ValeTeeRating[] = [
  { teeName: "Blue", gender: "M", courseRating: 77.3, slopeRating: 134, whsPar: 73 },
  { teeName: "White", gender: "M", courseRating: 75.2, slopeRating: 130, whsPar: 73 },
  { teeName: "Yellow", gender: "M", courseRating: 73.5, slopeRating: 126, whsPar: 73 },
  { teeName: "Red", gender: "M", courseRating: 69.1, slopeRating: 119, whsPar: 73 },
] as const;

export const VALE_LAKE_TEE_RATINGS: readonly ValeTeeRating[] = [
  { teeName: "White", gender: "M", courseRating: 71.9, slopeRating: 130, whsPar: 72 },
  { teeName: "Yellow", gender: "M", courseRating: 70.3, slopeRating: 123, whsPar: 72 },
  { teeName: "Winter Yellow", gender: "M", courseRating: 68.6, slopeRating: 122, whsPar: 72 },
  { teeName: "Winter Red", gender: "M", courseRating: 67.8, slopeRating: 121, whsPar: 72 },
  { teeName: "Red", gender: "M", courseRating: 69.0, slopeRating: 120, whsPar: 72 },
] as const;

export function findValeTeeRating(
  course: "wales-national" | "lake",
  teeName: string,
): ValeTeeRating | undefined {
  const list = course === "wales-national" ? VALE_WALES_NATIONAL_TEE_RATINGS : VALE_LAKE_TEE_RATINGS;
  const key = teeName.trim().toLowerCase();
  return list.find((t) => t.teeName.toLowerCase() === key);
}
