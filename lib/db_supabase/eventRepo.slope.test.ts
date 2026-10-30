import { describe, expect, it } from "vitest";
import { normalizeSlopeRating } from "@/lib/teeMetrics";

/** Mirrors createEvent/updateEvent slope payload mapping in eventRepo. */
function slopePayloadField(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  return normalizeSlopeRating(value);
}

describe("eventRepo slope payload", () => {
  it("stores null for Meon Valley–style missing slope (not 0)", () => {
    expect(slopePayloadField(0)).toBeNull();
    expect(slopePayloadField(null)).toBeNull();
  });

  it("stores valid slope for WHS tees", () => {
    expect(slopePayloadField(128)).toBe(128);
  });

  it("omits field when undefined", () => {
    expect(slopePayloadField(undefined)).toBeUndefined();
  });
});
