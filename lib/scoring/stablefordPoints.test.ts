import { describe, expect, it } from "vitest";
import { stablefordPointsForHole } from "@/lib/scoring/stablefordPoints";

describe("stablefordPointsForHole", () => {
  it("scores net par as 2 points", () => {
    expect(stablefordPointsForHole(4, 4)).toBe(2);
  });

  it("scores net birdie as 3", () => {
    expect(stablefordPointsForHole(3, 4)).toBe(3);
  });

  it("scores net bogey as 1", () => {
    expect(stablefordPointsForHole(5, 4)).toBe(1);
  });

  it("scores net double bogey or worse as 0", () => {
    expect(stablefordPointsForHole(6, 4)).toBe(0);
    expect(stablefordPointsForHole(7, 4)).toBe(0);
  });

  it("scores net eagle as 4", () => {
    expect(stablefordPointsForHole(2, 4)).toBe(4);
  });
});
