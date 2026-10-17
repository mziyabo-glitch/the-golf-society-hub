import { describe, expect, it } from "vitest";
import { formatSlopeRatingLabel, normalizeSlopeRating } from "@/lib/teeMetrics";
import { getMeonValleyOfficialFallbackForTests } from "@/lib/course/officialScorecardFallback";

describe("normalizeSlopeRating", () => {
  it("returns null for missing, zero, blank, and NaN", () => {
    expect(normalizeSlopeRating(null)).toBeNull();
    expect(normalizeSlopeRating(undefined)).toBeNull();
    expect(normalizeSlopeRating(0)).toBeNull();
    expect(normalizeSlopeRating("")).toBeNull();
    expect(normalizeSlopeRating("   ")).toBeNull();
    expect(normalizeSlopeRating(Number.NaN)).toBeNull();
  });

  it("accepts valid WHS slopes 55–155", () => {
    expect(normalizeSlopeRating(55)).toBe(55);
    expect(normalizeSlopeRating(128.4)).toBe(128);
    expect(normalizeSlopeRating(155)).toBe(155);
  });

  it("rejects out-of-range slopes", () => {
    expect(normalizeSlopeRating(54)).toBeNull();
    expect(normalizeSlopeRating(156)).toBeNull();
  });

  it("Meon Valley official fallback tees have no slope", () => {
    const spec = getMeonValleyOfficialFallbackForTests();
    for (const tee of spec.tees) {
      expect(tee.metrics.slopeRating).toBeNull();
      expect(normalizeSlopeRating(tee.metrics.slopeRating)).toBeNull();
    }
  });
});

describe("formatSlopeRatingLabel", () => {
  it("does not show slope as 0", () => {
    expect(formatSlopeRatingLabel(0)).toBe("Slope not available");
    expect(formatSlopeRatingLabel(null)).toBe("Slope not available");
  });

  it("formats valid slope", () => {
    expect(formatSlopeRatingLabel(128)).toBe("SR 128");
  });
});
