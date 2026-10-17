import { describe, expect, it } from "vitest";
import {
  grossScoresMapFromStringDraft,
  validateGrossScoresAgainstSnapshot,
} from "@/lib/scoring/grossScoreEntryValidation";
import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";

const twoHoles: EventHoleSnapshot[] = [
  { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 5 },
  { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 10 },
];

describe("validateGrossScoresAgainstSnapshot", () => {
  it("accepts partial valid grosses", () => {
    expect(validateGrossScoresAgainstSnapshot({ 1: 4, 2: 5 }, twoHoles)).toEqual([]);
  });

  it("rejects unknown hole", () => {
    const e = validateGrossScoresAgainstSnapshot({ 3: 4 }, twoHoles);
    expect(e.some((x) => x.includes("3"))).toBe(true);
  });

  it("rejects empty map", () => {
    expect(validateGrossScoresAgainstSnapshot({}, twoHoles).length).toBeGreaterThan(0);
  });

  it("rejects out-of-range gross", () => {
    const e = validateGrossScoresAgainstSnapshot({ 1: 0 }, twoHoles);
    expect(e.length).toBeGreaterThan(0);
    const e2 = validateGrossScoresAgainstSnapshot({ 1: 31 }, twoHoles);
    expect(e2.length).toBeGreaterThan(0);
  });
});

describe("grossScoresMapFromStringDraft", () => {
  const holes = [
    { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
    { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
  ];

  it("skips empty strings and ignores invalid numbers", () => {
    expect(grossScoresMapFromStringDraft({ 1: "  4 ", 2: "" }, holes)).toEqual({ 1: 4 });
    expect(grossScoresMapFromStringDraft({ 1: "abc" }, holes)).toEqual({});
  });
});
