import { describe, expect, it } from "vitest";
import { parseCompetitionHoleInput, parseHoleNumbers } from "@/lib/teeSheetGrouping";

describe("parseCompetitionHoleInput", () => {
  it("normalizes comma-separated holes", () => {
    expect(parseCompetitionHoleInput("12, 14", "Nearest the Pin")).toEqual({
      ok: true,
      holes: [12, 14],
    });
    expect(parseCompetitionHoleInput("8,10", "Longest Drive")).toEqual({
      ok: true,
      holes: [8, 10],
    });
  });

  it("rejects non-numeric tokens", () => {
    const result = parseCompetitionHoleInput("8, abc", "Longest Drive");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not a valid hole number/i);
    }
  });

  it("rejects out-of-range holes", () => {
    const result = parseCompetitionHoleInput("0, 19", "Nearest the Pin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/out of range/i);
    }
  });

  it("rejects duplicate holes", () => {
    const result = parseCompetitionHoleInput("8, 8", "Longest Drive");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/duplicate/i);
    }
  });

  it("parseHoleNumbers delegates to strict parser", () => {
    expect(parseHoleNumbers("3, 7")).toEqual([3, 7]);
    expect(parseHoleNumbers("bad")).toEqual([]);
  });
});
