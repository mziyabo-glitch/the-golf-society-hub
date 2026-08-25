/**
 * Canonical WHS tee ratings for The Vale Resort sub-courses.
 * Source: official Vale Resort scorecards + WHS tables (golfhandicapcalculator.co, 2025–2026).
 */

export type ValeTeeRating = {
  teeName: string;
  gender: "M" | "F";
  courseRating: number;
  slopeRating: number;
  /** WHS par used for course handicap calculation. */
  whsPar: number;
};

export const VALE_WALES_NATIONAL_COURSE_NAME = "Vale Resort – Wales National Course";
export const VALE_LAKE_COURSE_NAME = "Vale Resort – Lake Course";

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
  { teeName: "Blue", gender: "F", courseRating: 83.9, slopeRating: 154, whsPar: 75 },
  { teeName: "White", gender: "F", courseRating: 81.5, slopeRating: 151, whsPar: 75 },
  { teeName: "Yellow", gender: "F", courseRating: 79.4, slopeRating: 146, whsPar: 75 },
  { teeName: "Red", gender: "F", courseRating: 75.7, slopeRating: 130, whsPar: 75 },
] as const;

export const VALE_LAKE_TEE_RATINGS: readonly ValeTeeRating[] = [
  { teeName: "White", gender: "M", courseRating: 71.9, slopeRating: 130, whsPar: 72 },
  { teeName: "Yellow", gender: "M", courseRating: 70.3, slopeRating: 123, whsPar: 72 },
  { teeName: "Winter Yellow", gender: "M", courseRating: 68.6, slopeRating: 122, whsPar: 72 },
  { teeName: "Winter Red", gender: "M", courseRating: 67.8, slopeRating: 121, whsPar: 72 },
  { teeName: "Red", gender: "M", courseRating: 69.0, slopeRating: 120, whsPar: 72 },
  { teeName: "White", gender: "F", courseRating: 77.4, slopeRating: 137, whsPar: 73 },
  { teeName: "Yellow", gender: "F", courseRating: 76.6, slopeRating: 136, whsPar: 74 },
  { teeName: "Winter Yellow", gender: "F", courseRating: 75.1, slopeRating: 135, whsPar: 74 },
  { teeName: "Winter Red", gender: "F", courseRating: 74.2, slopeRating: 133, whsPar: 74 },
  { teeName: "Red", gender: "F", courseRating: 74.9, slopeRating: 134, whsPar: 74 },
] as const;

/** DB `course_tees.tee_name` — ladies rows use the `(Ladies)` suffix (unique per course). */
export function valeTeeDbName(rating: ValeTeeRating): string {
  return rating.gender === "F" ? `${rating.teeName} (Ladies)` : rating.teeName;
}

export function findValeTeeRating(
  course: "wales-national" | "lake",
  teeName: string,
  gender: "M" | "F" = "M",
): ValeTeeRating | undefined {
  const list = course === "wales-national" ? VALE_WALES_NATIONAL_TEE_RATINGS : VALE_LAKE_TEE_RATINGS;
  const key = teeName.trim().toLowerCase();
  return list.find((t) => t.teeName.toLowerCase() === key && t.gender === gender);
}

export function valeTeeRatingsForCourse(course: "wales-national" | "lake"): readonly ValeTeeRating[] {
  return course === "wales-national" ? VALE_WALES_NATIONAL_TEE_RATINGS : VALE_LAKE_TEE_RATINGS;
}
