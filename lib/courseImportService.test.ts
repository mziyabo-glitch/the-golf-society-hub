import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GolfCourseApiCourse } from "@/types/course";
import type { PersistedCourseImport } from "@/types/course";

const { persistNormalizedCourseImport } = vi.hoisted(() => ({
  persistNormalizedCourseImport: vi.fn(),
}));

vi.mock("@/lib/courseRepo", () => ({
  persistNormalizedCourseImport,
}));

import { importCourseFromApiPayload } from "@/services/courseImportService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importCourseFromApiPayload", () => {
  it("normalizes then persists with golfcourseapi dedupe key", async () => {
    const apiCourse: GolfCourseApiCourse = {
      id: 1001,
      club_name: "Import Club",
      name: "North",
      tees: {
        male: [
          {
            tee_name: "Gold",
            course_rating: 72.5,
            slope_rating: 130,
            par_total: 72,
            total_yards: 6500,
            holes: [{ hole_number: 1, par: 4, yardage: 400, stroke_index: 5 }],
          },
        ],
      },
    };

    persistNormalizedCourseImport.mockResolvedValue({
      courseId: "uuid-course",
      apiId: 1001,
      courseName: "North",
      teeCount: 1,
      holeCount: 1,
      tees: [
        {
          id: "uuid-tee",
          teeName: "Gold",
          holeCount: 1,
          courseRating: 72.5,
          slopeRating: 130,
          parTotal: 72,
          gender: "M",
          yards: 6500,
        },
      ],
    });

    const result = await importCourseFromApiPayload(apiCourse);
    expect(persistNormalizedCourseImport).toHaveBeenCalledTimes(1);
    const normalized = persistNormalizedCourseImport.mock.calls[0]![0]!;
    expect(normalized.course.dedupeKey).toBe("golfcourseapi:1001");
    expect(normalized.tees[0]!.tee.courseRating).toBe(72.5);
    expect(normalized.tees[0]!.holes[0]!.strokeIndex).toBe(5);
    expect(result.courseId).toBe("uuid-course");
    expect(result.teeCount).toBe(1);
  });
});
