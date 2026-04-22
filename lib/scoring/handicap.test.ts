import { describe, expect, it } from "vitest";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";

describe("calculateCourseHandicap", () => {
  it("rounds WHS course handicap (example shape)", () => {
    // Index 18, slope 128, CR 72.0, par 72 → (18*128/113) + 0 ≈ 20.39 → 20
    expect(calculateCourseHandicap(18, 128, 72, 72)).toBe(20);
  });

  it("includes course rating vs par term", () => {
    // CR 74, par 72 → +2 to raw before round
    const withTerm = calculateCourseHandicap(10, 113, 74, 72);
    const baseline = calculateCourseHandicap(10, 113, 72, 72);
    expect(withTerm - baseline).toBe(2);
  });

  it("rejects non-finite inputs", () => {
    expect(() => calculateCourseHandicap(NaN, 113, 72, 72)).toThrow(/finite/);
    expect(() => calculateCourseHandicap(10, 0, 72, 72)).toThrow(/slope/);
  });
});
