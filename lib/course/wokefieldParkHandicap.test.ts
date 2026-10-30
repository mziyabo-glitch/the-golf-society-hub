import { describe, expect, it } from "vitest";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";
import { WOKEFIELD_PARK_TEE_RATINGS } from "@/lib/course/wokefieldParkTeeRatings";

const HI = 20.5;

describe("De Vere Wokefield Park — WHS course handicaps (HI 20.5)", () => {
  it("matches calculator for men's and women's tees", () => {
    const byKey = Object.fromEntries(
      WOKEFIELD_PARK_TEE_RATINGS.map((t) => [`${t.gender}:${t.teeName}`, t]),
    );
    const menBlack = byKey["M:Black"];
    const womenBlack = byKey["F:Black"];
    const womenRed = byKey["F:Red"];

    expect(
      calculateCourseHandicap(HI, menBlack.slopeRating, menBlack.courseRating, menBlack.whsPar),
    ).toBe(19);
    expect(
      calculateCourseHandicap(HI, womenBlack.slopeRating, womenBlack.courseRating, womenBlack.whsPar),
    ).toBe(25);
    expect(
      calculateCourseHandicap(HI, womenRed.slopeRating, womenRed.courseRating, womenRed.whsPar),
    ).toBe(22);
  });
});
