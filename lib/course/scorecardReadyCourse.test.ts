import { describe, expect, it } from "vitest";
import {
  courseEligibleForFreePlayScorecardSearch,
  courseHasStrictScorecardReadyActiveTee,
  strictScorecardReadyForTee,
  type ScorecardReadyHoleInput,
  type ScorecardReadyTeeInput,
} from "@/lib/course/scorecardReadyCourse";

function holes18(
  par: number,
  siBuilder: (n: number) => number,
): ScorecardReadyHoleInput[] {
  const out: ScorecardReadyHoleInput[] = [];
  for (let n = 1; n <= 18; n++) {
    out.push({ hole_number: n, par, stroke_index: siBuilder(n) });
  }
  return out;
}

describe("scorecardReadyCourse (Free Play strict gate)", () => {
  const ratedTee: ScorecardReadyTeeInput & { id: string } = {
    id: "tee-1",
    is_active: true,
    course_rating: 72,
    slope_rating: 130,
    par_total: 72,
  };

  it("hides when there are no tees (no rated active tee)", () => {
    const map = new Map<string, ScorecardReadyHoleInput[]>();
    expect(courseHasStrictScorecardReadyActiveTee([], map)).toBe(false);
  });

  it("hides tee with ratings but no SI on holes", () => {
    const holes = holes18(4, () => null as unknown as number);
    expect(strictScorecardReadyForTee(ratedTee, holes)).toBe(false);
  });

  it("hides 18 holes + duplicate stroke indexes", () => {
    const holes = holes18(4, (n) => (n <= 9 ? 1 : n)); // SI 1 on nine holes — not a permutation of 1..18
    expect(strictScorecardReadyForTee(ratedTee, holes)).toBe(false);
  });

  it("hides inactive tee even with perfect holes", () => {
    const inactive: ScorecardReadyTeeInput & { id: string } = { ...ratedTee, id: "t2", is_active: false };
    const holes = holes18(4, (n) => n);
    expect(strictScorecardReadyForTee(inactive, holes)).toBe(false);
    expect(courseHasStrictScorecardReadyActiveTee([inactive], new Map([[inactive.id, holes]]))).toBe(false);
  });

  it("shows full rating + 18 holes + valid SI permutation", () => {
    const perm = holes18(4, (n) => n);
    expect(strictScorecardReadyForTee(ratedTee, perm)).toBe(true);
  });

  it("eligible search: duplicate name group is hidden even when strict-ready", () => {
    const nk = new Map<string, string[]>([["test gc", ["c1", "c2"]]]);
    const tee: ScorecardReadyTeeInput & { id: string } = {
      ...ratedTee,
      id: "t1",
    };
    const holes = holes18(4, (n) => n);
    const byTee = new Map([[tee.id, holes]]);
    expect(courseEligibleForFreePlayScorecardSearch("c1", [tee], byTee, nk)).toBe(false);
    expect(courseEligibleForFreePlayScorecardSearch("c3", [tee], byTee, new Map([["solo", ["c3"]]]))).toBe(true);
  });
});
