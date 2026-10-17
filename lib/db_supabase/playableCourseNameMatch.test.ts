import { describe, expect, it } from "vitest";

import { normalizePlayableCourseNameKey, normalizedLabelMatchScore } from "@/lib/db_supabase/playableCourseNameMatch";

describe("normalizePlayableCourseNameKey", () => {
  it("strips golf club wording for comparison", () => {
    expect(normalizePlayableCourseNameKey("Shrivenham Park Golf Club")).toBe("shrivenham park");
    expect(normalizePlayableCourseNameKey("Shrivenham Park GC Summer")).toBe("shrivenham park gc summer");
  });
});

describe("normalizedLabelMatchScore", () => {
  it("scores high when club name matches round saved as club", () => {
    const target = normalizePlayableCourseNameKey("Shrivenham Park Golf Club");
    const clubKey = normalizePlayableCourseNameKey("Shrivenham Park Golf Club");
    expect(normalizedLabelMatchScore(target, clubKey)).toBe(100);
  });

  it("scores layout course_name against club-based round key (Shrivenham case)", () => {
    const target = normalizePlayableCourseNameKey("Shrivenham Park Golf Club");
    const layoutKey = normalizePlayableCourseNameKey("Shrivenham Park GC Summer");
    expect(normalizedLabelMatchScore(target, layoutKey)).toBeGreaterThanOrEqual(40);
  });
});
