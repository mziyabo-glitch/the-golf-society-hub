import { describe, expect, it } from "vitest";
import { getTeeHoleCompletenessIssues, normalizeGolfCourseApiCourse } from "@/lib/courseNormalizer";
import type { GolfCourseApiCourse } from "@/types/course";

function hole(n: number, overrides: Partial<{ par: number; yardage: number; handicap: number }> = {}) {
  return {
    hole_number: n,
    par: overrides.par ?? 4,
    yardage: overrides.yardage ?? 350 + n,
    handicap: overrides.handicap ?? n,
  };
}

describe("normalizeGolfCourseApiCourse", () => {
  it("builds dedupeKey, fullName, and flattens male/female tees", () => {
    const api: GolfCourseApiCourse = {
      id: 42,
      club_name: "Wycombe Heights",
      course_name: "Main Course",
      latitude: 51.62,
      longitude: -0.78,
      tees: {
        male: [
          {
            tee_name: "White",
            course_rating: 71.2,
            bogey_rating: 95,
            slope_rating: 128,
            par_total: 72,
            total_yards: 6400,
            holes: [1, 2, 3].map((n) => hole(n)),
          },
        ],
        female: [
          {
            tee_name: "White",
            course_rating: 75.0,
            slope_rating: 132,
            par_total: 72,
            total_yards: 5800,
            holes: [1, 2].map((n) => hole(n, { par: 3, yardage: 120, handicap: n })),
          },
        ],
      },
    };
    const out = normalizeGolfCourseApiCourse(api);
    expect(out.course.dedupeKey).toBe("golfcourseapi:42");
    expect(out.course.fullName).toContain("Wycombe Heights");
    expect(out.course.fullName).toContain("Main Course");
    expect(out.tees).toHaveLength(2);
    const men = out.tees.find((t) => t.tee.gender === "M");
    const ladies = out.tees.find((t) => t.tee.gender === "F");
    expect(men?.tee.isDefault).toBe(true);
    expect(ladies?.tee.teeName.toLowerCase()).toContain("ladies");
    expect(men?.holes).toHaveLength(3);
    expect(men?.holes[0]?.strokeIndex).toBe(1);
    expect(ladies?.holes).toHaveLength(2);
  });

  it("disambiguates duplicate tee names and survives missing tees/holes", () => {
    const api: GolfCourseApiCourse = {
      id: 7,
      name: "Solo",
      tees: {
        male: [
          { tee_name: "Blue", course_rating: 70, slope_rating: 120, par_total: 72 },
          { tee_name: "Blue", course_rating: 69, slope_rating: 118, par_total: 72 },
        ],
      },
    };
    const out = normalizeGolfCourseApiCourse(api);
    expect(out.tees.map((t) => t.tee.teeName)).toEqual(["Blue", "Blue (2)"]);
    expect(out.tees.every((t) => t.holes.length === 0)).toBe(true);
  });

  it("defaults to Yellow when no White", () => {
    const api: GolfCourseApiCourse = {
      id: 501,
      name: "Links",
      tees: {
        male: [
          { tee_name: "Blue", slope_rating: 125, par_total: 72, holes: [1, 2, 3].map((n) => hole(n)) },
          { tee_name: "Yellow", slope_rating: 121, par_total: 72, holes: [1, 2, 3].map((n) => hole(n)) },
        ],
      },
    };
    const out = normalizeGolfCourseApiCourse(api);
    const def = out.tees.find((t) => t.tee.isDefault);
    expect(def?.tee.teeName.toLowerCase()).toBe("yellow");
  });

  it("defaults to lowest slope when no White/Yellow", () => {
    const api: GolfCourseApiCourse = {
      id: 502,
      name: "Heath",
      tees: {
        male: [
          { tee_name: "Blue", slope_rating: 130, par_total: 72, holes: [1, 2].map((n) => hole(n)) },
          { tee_name: "Red", slope_rating: 118, par_total: 72, holes: [1, 2].map((n) => hole(n)) },
        ],
      },
    };
    const out = normalizeGolfCourseApiCourse(api);
    const def = out.tees.find((t) => t.tee.isDefault);
    expect(def?.tee.teeName.toLowerCase()).toBe("red");
  });

  it("accepts tees as a flat array (unisex)", () => {
    const api: GolfCourseApiCourse = {
      id: 99,
      name: "Flat",
      tees: [{ tee_name: "Red", par_total: 54, holes: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => hole(n)) }],
    };
    const out = normalizeGolfCourseApiCourse(api);
    expect(out.tees).toHaveLength(1);
    expect(out.tees[0]!.tee.apiSourceGroup).toBe("unisex");
    expect(out.tees[0]!.holes).toHaveLength(9);
  });

  it("applies Upavon SI fallback when API holes omit SI", () => {
    const api: GolfCourseApiCourse = {
      id: 12241,
      name: "Upavon",
      tees: {
        male: [
          {
            tee_name: "White",
            course_rating: 71.8,
            slope_rating: 125,
            par_total: 71,
            total_yards: 6402,
            holes: Array.from({ length: 18 }, (_, i) => ({
              hole_number: i + 1,
              par: i === 5 || i === 7 || i === 11 || i === 13 || i === 17 ? 3 : 4,
              yardage: 300 + i,
            })),
          },
        ],
      },
    };
    const out = normalizeGolfCourseApiCourse(api);
    const holes = out.tees[0]!.holes;
    expect(holes).toHaveLength(18);
    expect(holes[0]!.strokeIndex).toBe(13);
    expect(holes[3]!.strokeIndex).toBe(1);
    expect(holes[12]!.strokeIndex).toBe(2);
    expect(holes[17]!.strokeIndex).toBe(10);
  });
});

describe("getTeeHoleCompletenessIssues", () => {
  it("flags wrong hole count and missing fields", () => {
    const issues = getTeeHoleCompletenessIssues("White", [
      { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 5 },
      { holeNumber: 2, par: null, yardage: 100, strokeIndex: 1 },
    ]);
    expect(issues.some((m) => m.includes("expected 9 or 18"))).toBe(true);
    expect(issues.some((m) => m.includes("hole 2"))).toBe(true);
  });
});
