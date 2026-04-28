import type { NormalizedHole } from "@/types/course";

export type MergeSource = "primary_verified" | "golfcourseapi" | "uk_golf_api";

export type CourseCompleteness = {
  has18Holes: boolean;
  hasValidSi: boolean;
  hasCourseRating: boolean;
  hasSlopeRating: boolean;
  hasParTotal: boolean;
  hasYardageTotal: boolean;
};

export type MergeCourseData = {
  source: MergeSource;
  teeSet: string | null;
  holes: NormalizedHole[];
  courseRating: number | null;
  slopeRating: number | null;
  parTotal: number | null;
  totalYardage: number | null;
  verifiedForPlay: boolean;
  completeness: CourseCompleteness;
};

export type UpgradeReason =
  | "adds_stroke_index"
  | "adds_rating_slope"
  | "fixes_incomplete_holes"
  | "better_data_quality";

function hasValidSi(h: NormalizedHole[]): boolean {
  if (h.length !== 18) return false;
  const set = new Set<number>();
  for (const hole of h) {
    if (hole.strokeIndex == null) return false;
    if (hole.strokeIndex < 1 || hole.strokeIndex > 18) return false;
    if (set.has(hole.strokeIndex)) return false;
    set.add(hole.strokeIndex);
  }
  return set.size === 18;
}

export function computeCompleteness(data: Omit<MergeCourseData, "verifiedForPlay" | "completeness">): CourseCompleteness {
  return {
    has18Holes: data.holes.length === 18,
    hasValidSi: hasValidSi(data.holes),
    hasCourseRating: data.courseRating != null,
    hasSlopeRating: data.slopeRating != null,
    hasParTotal: data.parTotal != null,
    hasYardageTotal: data.totalYardage != null,
  };
}

export function computeVerifiedForPlay(c: CourseCompleteness): boolean {
  return (
    c.has18Holes &&
    c.hasValidSi &&
    c.hasCourseRating &&
    c.hasSlopeRating &&
    c.hasParTotal &&
    c.hasYardageTotal
  );
}

function score(c: CourseCompleteness): number {
  return (
    (c.has18Holes ? 2 : 0) +
    (c.hasValidSi ? 3 : 0) +
    (c.hasCourseRating ? 2 : 0) +
    (c.hasSlopeRating ? 2 : 0) +
    (c.hasParTotal ? 1 : 0) +
    (c.hasYardageTotal ? 1 : 0)
  );
}

export function compareCourseCompleteness(a: CourseCompleteness, b: CourseCompleteness): "a" | "b" | "equal" {
  const sa = score(a);
  const sb = score(b);
  if (sa > sb) return "a";
  if (sb > sa) return "b";
  return "equal";
}

function withComputed(data: Omit<MergeCourseData, "verifiedForPlay" | "completeness">): MergeCourseData {
  const completeness = computeCompleteness(data);
  return {
    ...data,
    completeness,
    verifiedForPlay: computeVerifiedForPlay(completeness),
  };
}

export function mergeCourseData(
  existingCourse: MergeCourseData | null,
  ukCandidate: MergeCourseData | null,
  golfApiCandidate: MergeCourseData | null,
): {
  merged: MergeCourseData | null;
  candidateSource: MergeSource | null;
  promotionCandidate: boolean;
  upgradeReason: UpgradeReason | null;
} {
  if (!ukCandidate && !golfApiCandidate) {
    return { merged: existingCourse, candidateSource: null, promotionCandidate: false, upgradeReason: null };
  }

  // Prefer merged tee when UK gives hole fidelity and GolfCourseAPI gives missing rating/slope.
  let bestCandidate = ukCandidate ?? golfApiCandidate!;
  if (ukCandidate && golfApiCandidate) {
    const merged = withComputed({
      source: "uk_golf_api",
      teeSet: ukCandidate.teeSet ?? golfApiCandidate.teeSet,
      holes: ukCandidate.holes,
      courseRating: ukCandidate.courseRating ?? golfApiCandidate.courseRating,
      slopeRating: ukCandidate.slopeRating ?? golfApiCandidate.slopeRating,
      parTotal: ukCandidate.parTotal ?? golfApiCandidate.parTotal,
      totalYardage: ukCandidate.totalYardage ?? golfApiCandidate.totalYardage,
    });
    const direct = compareCourseCompleteness(
      merged.completeness,
      bestCandidate.completeness,
    );
    if (direct === "a") {
      bestCandidate = merged;
    }
  }

  if (!existingCourse) {
    return {
      merged: bestCandidate,
      candidateSource: bestCandidate.source,
      promotionCandidate: true,
      upgradeReason: "better_data_quality",
    };
  }

  if (existingCourse.verifiedForPlay) {
    const cmp = compareCourseCompleteness(bestCandidate.completeness, existingCourse.completeness);
    if (cmp !== "a") {
      return {
        merged: existingCourse,
        candidateSource: bestCandidate.source,
        promotionCandidate: false,
        upgradeReason: null,
      };
    }
  }

  const cmp = compareCourseCompleteness(bestCandidate.completeness, existingCourse.completeness);
  if (cmp !== "a") {
    return {
      merged: existingCourse,
      candidateSource: bestCandidate.source,
      promotionCandidate: false,
      upgradeReason: null,
    };
  }

  let reason: UpgradeReason = "better_data_quality";
  if (!existingCourse.completeness.hasValidSi && bestCandidate.completeness.hasValidSi) {
    reason = "adds_stroke_index";
  } else if (
    (!existingCourse.completeness.hasCourseRating || !existingCourse.completeness.hasSlopeRating) &&
    bestCandidate.completeness.hasCourseRating &&
    bestCandidate.completeness.hasSlopeRating
  ) {
    reason = "adds_rating_slope";
  } else if (!existingCourse.completeness.has18Holes && bestCandidate.completeness.has18Holes) {
    reason = "fixes_incomplete_holes";
  }

  return {
    merged: bestCandidate,
    candidateSource: bestCandidate.source,
    promotionCandidate: true,
    upgradeReason: reason,
  };
}

