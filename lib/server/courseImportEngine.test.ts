import { describe, expect, it } from "vitest";
import { validateNormalizedImport } from "@/lib/server/courseImportEngine";
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
