import { describe, expect, it } from "vitest";
import { getEventScoringMode, normalizeEventFormat } from "@/lib/scoring/eventFormat";

describe("normalizeEventFormat", () => {
  it("normalizes legacy medal to strokeplay_net", () => {
    expect(normalizeEventFormat("medal")).toBe("strokeplay_net");
    expect(normalizeEventFormat("MEDAL")).toBe("strokeplay_net");
  });

  it("preserves canonical values", () => {
    expect(normalizeEventFormat("stableford")).toBe("stableford");
    expect(normalizeEventFormat("strokeplay_gross")).toBe("strokeplay_gross");
  });

  it("rejects unknown", () => {
    expect(() => normalizeEventFormat("matchplay")).toThrow(/unsupported/);
  });
});

describe("getEventScoringMode", () => {
  it("returns points for stableford", () => {
    expect(getEventScoringMode("stableford")).toBe("points");
  });

  it("returns strokes for strokeplay", () => {
    expect(getEventScoringMode("strokeplay_net")).toBe("strokes");
    expect(getEventScoringMode("strokeplay_gross")).toBe("strokes");
  });

  it("treats medal as strokes (legacy alias)", () => {
    expect(getEventScoringMode("medal")).toBe("strokes");
  });

  it("rejects unknown formats", () => {
    expect(() => getEventScoringMode("matchplay")).toThrow(/unsupported/);
  });
});
