import { describe, expect, it } from "vitest";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";
import { calculatePlayingHandicap } from "@/lib/handicapUtils";
import {
  VALE_LAKE_TEE_RATINGS,
  VALE_WALES_NATIONAL_TEE_RATINGS,
  type ValeTeeRating,
} from "@/lib/course/valeResortTeeRatings";

const HI = 21;

function expectCourseHandicap(tee: ValeTeeRating, expected: number): void {
  const ch = calculateCourseHandicap(HI, tee.slopeRating, tee.courseRating, tee.whsPar);
  expect(ch).toBe(expected);
}

describe("The Vale Resort — Wales National course handicaps (HI 21.0)", () => {
  it("matches official WHS course handicaps per tee", () => {
    const byName = Object.fromEntries(VALE_WALES_NATIONAL_TEE_RATINGS.filter((t) => t.gender === "M").map((t) => [t.teeName, t]));
    expectCourseHandicap(byName.Blue, 29);
    expectCourseHandicap(byName.White, 26);
    expectCourseHandicap(byName.Yellow, 24);
    expectCourseHandicap(byName.Red, 18);
  });
});

describe("The Vale Resort — Lake course handicaps (HI 21.0)", () => {
  it("matches official WHS course handicaps per tee", () => {
    const byName = Object.fromEntries(VALE_LAKE_TEE_RATINGS.filter((t) => t.gender === "M").map((t) => [t.teeName, t]));
    expectCourseHandicap(byName.White, 24);
    expectCourseHandicap(byName.Yellow, 21);
    expectCourseHandicap(byName["Winter Yellow"], 19);
    expectCourseHandicap(byName["Winter Red"], 18);
    expectCourseHandicap(byName.Red, 19);
  });
});

describe("The Vale Resort — ladies tee handicaps (HI 21.0)", () => {
  it("Wales National ladies Yellow", () => {
    const tee = VALE_WALES_NATIONAL_TEE_RATINGS.find((t) => t.gender === "F" && t.teeName === "Yellow")!;
    expect(calculateCourseHandicap(HI, tee.slopeRating, tee.courseRating, tee.whsPar)).toBe(32);
  });

  it("Lake ladies Yellow", () => {
    const tee = VALE_LAKE_TEE_RATINGS.find((t) => t.gender === "F" && t.teeName === "Yellow")!;
    expect(calculateCourseHandicap(HI, tee.slopeRating, tee.courseRating, tee.whsPar)).toBe(28);
  });
});

describe("The Vale Resort — playing handicap allowance", () => {
  it("applies event allowance to course handicap (95% example)", () => {
    const yellow = VALE_LAKE_TEE_RATINGS.find((t) => t.teeName === "Yellow")!;
    const ch = calculateCourseHandicap(HI, yellow.slopeRating, yellow.courseRating, yellow.whsPar);
    expect(ch).toBe(21);
    expect(calculatePlayingHandicap(ch, 0.95)).toBe(20);
  });
});

describe("The Vale Resort — event tee snapshot → scoring path", () => {
  it("recalculates course handicap when event tee selection changes (Wales National Blue → Yellow)", () => {
    const blue = VALE_WALES_NATIONAL_TEE_RATINGS.find((t) => t.teeName === "Blue")!;
    const yellow = VALE_WALES_NATIONAL_TEE_RATINGS.find((t) => t.teeName === "Yellow")!;

    const chBlue = calculateCourseHandicap(HI, blue.slopeRating, blue.courseRating, blue.whsPar);
    const chYellow = calculateCourseHandicap(HI, yellow.slopeRating, yellow.courseRating, yellow.whsPar);

    expect(chBlue).toBe(29);
    expect(chYellow).toBe(24);
    expect(chYellow).toBeLessThan(chBlue);
  });
});
