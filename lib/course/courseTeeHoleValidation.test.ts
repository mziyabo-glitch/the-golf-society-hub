import { describe, expect, it } from "vitest";
import { assertLiveTeeHolesValidForEventAttach, type TeeHoleRowLike } from "@/lib/course/courseTeeHoleValidation";

function hole(n: number, par = 4, yardage = 350, si = n): TeeHoleRowLike {
  return { hole_number: n, par, yardage, stroke_index: si };
}

describe("assertLiveTeeHolesValidForEventAttach", () => {
  it("accepts 9 valid holes", () => {
    const holes = Array.from({ length: 9 }, (_, i) => hole(i + 1));
    expect(() => assertLiveTeeHolesValidForEventAttach(holes)).not.toThrow();
  });

  it("accepts 18 valid holes", () => {
    const holes = Array.from({ length: 18 }, (_, i) => hole(i + 1));
    expect(() => assertLiveTeeHolesValidForEventAttach(holes)).not.toThrow();
  });

  it("rejects wrong count", () => {
    const holes = [hole(1), hole(2)];
    expect(() => assertLiveTeeHolesValidForEventAttach(holes)).toThrow(/9 or 18/);
  });

  it("rejects null par", () => {
    const holes = Array.from({ length: 9 }, (_, i) => (i === 0 ? { ...hole(1), par: null } : hole(i + 1)));
    expect(() => assertLiveTeeHolesValidForEventAttach(holes)).toThrow(/par/);
  });
});
