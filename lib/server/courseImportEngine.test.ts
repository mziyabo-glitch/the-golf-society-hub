import { describe, expect, it } from "vitest";
import {
  buildImportYieldWorkPhaseMetrics,
  buildNewCourseGrowthWasteFromGrowthResults,
  buildSearchQueryVariantsForImport,
  COURSE_IMPORT_SEEDING_PRESET_CAPS,
  resolveCourseImportRunMode,
  scoreGolfApiSearchRowAgainstTarget,
  validateNormalizedImport,
} from "@/lib/server/courseImportEngine";
import type { NormalizedCourseImport } from "@/types/course";

function baseImport(): NormalizedCourseImport {
  return {
    course: {
      apiId: 1,
      clubName: "Test Club",
      courseName: "Test Course",
      fullName: "Test Club - Test Course",
      address: null,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
      dedupeKey: "golfcourseapi:1",
      normalizedNameKey: "test",
      source: "golfcourseapi",
    },
    tees: [
      {
        tee: {
          teeName: "White",
          gender: "M",
          apiSourceGroup: "male",
          courseRating: 71.2,
          bogeyRating: null,
          slopeRating: 126,
          parTotal: 72,
          totalYards: 6500,
          totalMeters: null,
          teeColor: null,
          isDefault: true,
          displayOrder: 0,
          holes: [],
        },
        holes: Array.from({ length: 18 }, (_, idx) => ({
          holeNumber: idx + 1,
          par: 4,
          yardage: 350 + idx,
          strokeIndex: idx + 1,
        })),
      },
    ],
  };
}

describe("buildNewCourseGrowthWasteFromGrowthResults", () => {
  it("separates net-new inserts, catalog refreshes, and skip classes", () => {
    const results = [
      {
        courseName: "A",
        apiId: 1,
        status: "ok" as const,
        validationIssues: [],
        growthConversion: {
          resolutionPath: "api_search" as const,
          newCourseInserted: true,
          existingCourseUpdated: false,
        },
      },
      {
        courseName: "B",
        apiId: 2,
        status: "ok" as const,
        validationIssues: [],
        growthConversion: {
          resolutionPath: "db_name_match" as const,
          newCourseInserted: false,
          existingCourseUpdated: true,
        },
      },
      {
        courseName: "Woodhall Spa Golf Club",
        apiId: null,
        status: "skipped" as const,
        validationIssues: [],
        error: "Unresolved candidate (ambiguous_api_match): x",
        growthConversion: {
          resolutionPath: "unresolved" as const,
          skipReason: "ambiguous_api_match" as const,
          newCourseInserted: false,
          existingCourseUpdated: false,
        },
      },
    ];
    const w = buildNewCourseGrowthWasteFromGrowthResults(results);
    expect(w.attempted).toBe(3);
    expect(w.netNewInserts).toBe(1);
    expect(w.existingCourseRowsRefreshed).toBe(1);
    expect(w.notNetNew.fromDbOrPreferredPath).toBe(1);
    expect(w.skipped.ambiguousApiMatch).toBe(1);
    expect(w.spotlightUnresolved.length).toBeGreaterThan(0);
  });
});

describe("buildImportYieldWorkPhaseMetrics", () => {
  it("computes yield and splits unresolved skips", () => {
    const results = [
      { courseName: "A", apiId: 1, status: "ok" as const, validationIssues: [] },
      { courseName: "B", apiId: 2, status: "ok" as const, validationIssues: [] },
      {
        courseName: "C",
        apiId: null,
        status: "skipped" as const,
        validationIssues: [],
        error: "Unresolved candidate (ambiguous_api_match): x",
      },
      { courseName: "D", apiId: null, status: "skipped" as const, validationIssues: [], error: "other skip" },
    ];
    const m = buildImportYieldWorkPhaseMetrics(4, 2, 0, results);
    expect(m.attempted).toBe(4);
    expect(m.inserted).toBe(2);
    expect(m.updated).toBe(0);
    expect(m.unresolved).toBe(1);
    expect(m.skipped).toBe(2);
    expect(m.importYieldPct).toBe(50);
  });

  it("returns null yield when nothing attempted", () => {
    const m = buildImportYieldWorkPhaseMetrics(0, 0, 0, []);
    expect(m.importYieldPct).toBeNull();
  });
});

describe("course import run mode", () => {
  it("resolveCourseImportRunMode prefers explicit options over env", () => {
    expect(resolveCourseImportRunMode({ runMode: "seeding" })).toBe("seeding");
    expect(resolveCourseImportRunMode({ runMode: "maintenance" })).toBe("maintenance");
  });

  it("exposes seeding preset caps for ops ramp tuning", () => {
    expect(COURSE_IMPORT_SEEDING_PRESET_CAPS.maxNewCourseImportAttempts).toBe(75);
    expect(COURSE_IMPORT_SEEDING_PRESET_CAPS.maxStaleCatalogSweepCourses).toBe(0);
  });
});

describe("GolfCourseAPI search helpers", () => {
  it("buildSearchQueryVariantsForImport adds shorter venue tokens for long club names", () => {
    const v = buildSearchQueryVariantsForImport("Woodhall Spa Golf Club", "woodhall spa golf club");
    expect(v[0]).toBe("Woodhall Spa Golf Club");
    expect(v).toContain("Woodhall Spa");
    expect(v).toContain("Hotchkin");
    expect(v).toContain("National Golf Centre");
  });

  it("scores API club+course rows against marketing-style candidate names", () => {
    const target = "Celtic Manor Resort";
    const row = { club_name: "Celtic Manor Resort", course_name: "Roman Road Course" };
    const s = scoreGolfApiSearchRowAgainstTarget(target, row);
    expect(s).toBeGreaterThan(0.45);
  });
});

describe("validateNormalizedImport", () => {
  it("returns no issues for valid 18-hole import", () => {
    const issues = validateNormalizedImport(baseImport());
    expect(issues).toEqual([]);
  });

  it("flags hole count, duplicate SI, out-of-range SI, and invalid numbers", () => {
    const payload = baseImport();
    payload.tees[0]!.holes = [
      { holeNumber: 1, par: 4, yardage: 350, strokeIndex: 1 },
      { holeNumber: 2, par: 4, yardage: 351, strokeIndex: 1 },
      { holeNumber: 3, par: -1, yardage: 0, strokeIndex: 19 },
    ];
    payload.tees[0]!.tee.courseRating = 0;

    const issues = validateNormalizedImport(payload);
    expect(issues.some((i) => i.code === "HOLE_COUNT")).toBe(true);
    expect(issues.some((i) => i.code === "SI_DUPLICATE")).toBe(true);
    expect(issues.some((i) => i.code === "SI_OUT_OF_RANGE")).toBe(true);
    expect(issues.some((i) => i.code === "NUMERIC_INVALID")).toBe(true);
  });
});
