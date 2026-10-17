import { describe, expect, it } from "vitest";
import {
  applyOfficialScorecardFallback,
  getMeonValleyOfficialFallbackForTests,
  getMeonValleyYellowSiSequence,
  normalizeOfficialCourseMatchKey,
  resolveOfficialCourseFallback,
} from "@/lib/course/officialScorecardFallback";
import { strictScorecardReadyForTee, type ScorecardReadyHoleInput } from "@/lib/course/scorecardReadyCourse";
import type { NormalizedHole } from "@/types/course";

function emptyHoles18(): NormalizedHole[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 100,
    strokeIndex: null,
  }));
}

function badApiHoles18(): NormalizedHole[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 100,
    strokeIndex: 1,
  }));
}

describe("Meon Valley official scorecard fallback", () => {
  const aliases = [
    "Meon Valley",
    "Meon Valley Hotel & Country Club",
    "Meon Valley Hotel and Country Club",
    "Meon Course",
    "Meon Valley - Meon Course",
  ];

  it.each(aliases)("matches alias %s", (name) => {
    expect(resolveOfficialCourseFallback({ courseName: name })).not.toBeNull();
  });

  it("does not match the 9-hole Valley Course alone", () => {
    expect(resolveOfficialCourseFallback({ courseName: "Valley Course", clubName: "Meon Valley" })).toBeNull();
  });

  it("overrides bad API stroke indexes and ratings for white tee", () => {
    const out = applyOfficialScorecardFallback({
      apiId: 99999,
      teeName: "White",
      holes: badApiHoles18(),
      clubName: "Meon Valley Hotel & Country Club",
      courseName: "Meon Course",
    });
    expect(out.applied).toBe(true);
    expect(out.fullOverride).toBe(true);
    expect(out.teeMetrics?.totalYards).toBe(6492);
    expect(out.teeMetrics?.parTotal).toBe(71);
    expect(out.teeMetrics?.courseRating).toBe(72);
    expect(out.teeMetrics?.slopeRating).toBeNull();
    expect(out.holes.map((h) => h.strokeIndex)).toEqual([...getMeonValleyYellowSiSequence()]);
    expect(out.holes.reduce((s, h) => s + (h.yardage ?? 0), 0)).toBe(6492);
  });

  it("yellow tee official totals and SI", () => {
    const out = applyOfficialScorecardFallback({
      apiId: 1,
      teeName: "Yellow",
      holes: emptyHoles18(),
      courseName: "Meon Valley - Meon Course",
    });
    expect(out.teeMetrics?.totalYards).toBe(6073);
    expect(out.teeMetrics?.parTotal).toBe(71);
    expect(out.teeMetrics?.courseRating).toBe(70);
    expect(out.holes.map((h) => h.strokeIndex)).toEqual([...getMeonValleyYellowSiSequence()]);
  });

  it("red tee official totals and SI", () => {
    const redSi = [13, 7, 1, 17, 11, 5, 15, 3, 9, 6, 2, 16, 12, 14, 8, 10, 4, 18];
    const out = applyOfficialScorecardFallback({
      apiId: 1,
      teeName: "Red",
      holes: emptyHoles18(),
      clubName: "Meon Valley Hotel and Country Club",
    });
    expect(out.teeMetrics?.totalYards).toBe(5620);
    expect(out.teeMetrics?.parTotal).toBe(73);
    expect(out.teeMetrics?.courseRating).toBe(73);
    expect(out.holes.map((h) => h.strokeIndex)).toEqual(redSi);
  });

  it("white and yellow share the same SI sequence", () => {
    const white = applyOfficialScorecardFallback({
      apiId: 1,
      teeName: "White",
      holes: emptyHoles18(),
      courseName: "Meon Valley",
    });
    const yellow = applyOfficialScorecardFallback({
      apiId: 1,
      teeName: "Yellow",
      holes: emptyHoles18(),
      courseName: "Meon Valley",
    });
    expect(white.holes.map((h) => h.strokeIndex)).toEqual(yellow.holes.map((h) => h.strokeIndex));
  });

  it("each tee has 18 holes with SI 1-18 exactly once", () => {
    for (const teeName of ["White", "Yellow", "Red"]) {
      const out = applyOfficialScorecardFallback({
        apiId: 1,
        teeName,
        holes: emptyHoles18(),
        courseName: "Meon Valley",
      });
      expect(out.holes).toHaveLength(18);
      const sis = out.holes.map((h) => h.strokeIndex);
      expect(new Set(sis).size).toBe(18);
      expect(sis.every((si) => si != null && si >= 1 && si <= 18)).toBe(true);
    }
  });

  it("OUT/IN par and yardage totals match official summary", () => {
    const spec = getMeonValleyOfficialFallbackForTests();
    const white = spec.tees.find((t) => t.teeKeys.includes("white"))!;
    const outHoles = white.holes.filter((h) => h.holeNumber <= 9);
    const inHoles = white.holes.filter((h) => h.holeNumber >= 10);
    expect(outHoles.reduce((s, h) => s + h.par, 0)).toBe(36);
    expect(inHoles.reduce((s, h) => s + h.par, 0)).toBe(35);
    expect(outHoles.reduce((s, h) => s + h.yardage, 0)).toBe(3416);
    expect(inHoles.reduce((s, h) => s + h.yardage, 0)).toBe(3076);
  });

  it("is scorecard-ready without slope when course rating and par are set", () => {
    for (const teeName of ["White", "Yellow", "Red"]) {
      const out = applyOfficialScorecardFallback({
        apiId: 1,
        teeName,
        holes: emptyHoles18(),
        courseName: "Meon Valley",
      });
      const holeRows: ScorecardReadyHoleInput[] = out.holes.map((h) => ({
        hole_number: h.holeNumber,
        par: h.par,
        stroke_index: h.strokeIndex,
      }));
      expect(
        strictScorecardReadyForTee(
          {
            is_active: true,
            course_rating: out.teeMetrics!.courseRating,
            slope_rating: null,
            par_total: out.teeMetrics!.parTotal,
          },
          holeRows,
        ),
      ).toBe(true);
    }
  });

  it("normalizes match keys consistently", () => {
    expect(normalizeOfficialCourseMatchKey("Meon Valley Hotel & Country Club")).toBe(
      normalizeOfficialCourseMatchKey("Meon Valley Hotel and Country Club"),
    );
  });
});
