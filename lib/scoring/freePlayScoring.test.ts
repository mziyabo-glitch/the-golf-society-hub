import { describe, expect, it } from "vitest";
import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";
import {
  buildFreePlayLeaderboard,
  deriveCourseAndPlayingHandicapFromHi,
  freePlayHolesToSnapshots,
  intPlayingHandicap,
  normalizeHandicapIndexInput,
} from "@/lib/scoring/freePlayScoring";

function holes18UniformPar4(): EventHoleSnapshot[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 400,
    strokeIndex: i + 1,
  }));
}

describe("freePlayHolesToSnapshots", () => {
  it("fills defaults for null par and stroke index", () => {
    const snaps = freePlayHolesToSnapshots([{ hole_number: 3, par: null, stroke_index: null }]);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.holeNumber).toBe(3);
    expect(snaps[0]!.par).toBe(4);
    expect(snaps[0]!.strokeIndex).toBe(1);
  });
});

describe("intPlayingHandicap", () => {
  it("prefers playing handicap when set", () => {
    expect(intPlayingHandicap(12, 20)).toBe(12);
  });
  it("falls back to rounded HI", () => {
    expect(intPlayingHandicap(null, 15.4)).toBe(15);
  });
});

describe("normalizeHandicapIndexInput", () => {
  it("parses decimals and rounds to 1dp", () => {
    expect(normalizeHandicapIndexInput("18.44")).toBe(18.4);
  });
  it("accepts plus handicaps", () => {
    expect(normalizeHandicapIndexInput("-1.2")).toBe(-1.2);
  });
  it("rejects empty and non-numeric", () => {
    expect(normalizeHandicapIndexInput("")).toBeNull();
    expect(normalizeHandicapIndexInput("abc")).toBeNull();
  });
});

describe("deriveCourseAndPlayingHandicapFromHi", () => {
  it("computes CH/PH for HI 18.4 slope 121 rating 67.7 par 69", () => {
    const out = deriveCourseAndPlayingHandicapFromHi({
      handicapIndex: 18.4,
      slopeRating: 121,
      courseRating: 67.7,
      parTotal: 69,
    });
    expect(out.courseHandicap).toBe(18);
    expect(out.playingHandicap).toBe(18);
    expect(out.usedFormula).toBe(true);
  });

  it("computes CH/PH for HI 24.0 slope 114 rating 65.3 par 69", () => {
    const out = deriveCourseAndPlayingHandicapFromHi({
      handicapIndex: 24,
      slopeRating: 114,
      courseRating: 65.3,
      parTotal: 69,
    });
    expect(out.courseHandicap).toBe(21);
    expect(out.playingHandicap).toBe(21);
  });

  it("handles HI zero", () => {
    const out = deriveCourseAndPlayingHandicapFromHi({
      handicapIndex: 0,
      slopeRating: 121,
      courseRating: 67.7,
      parTotal: 69,
    });
    expect(out.courseHandicap).toBe(-1);
  });

  it("falls back safely when tee metrics unavailable", () => {
    const out = deriveCourseAndPlayingHandicapFromHi({
      handicapIndex: 12.7,
      slopeRating: null,
      courseRating: null,
      parTotal: null,
    });
    expect(out.courseHandicap).toBe(13);
    expect(out.playingHandicap).toBe(13);
    expect(out.usedFormula).toBe(false);
  });
});

describe("buildFreePlayLeaderboard", () => {
  it("orders stroke_net by ascending net", () => {
    const holes = holes18UniformPar4();
    const grossA = new Map<number, number | null>();
    const grossB = new Map<number, number | null>();
    for (let h = 1; h <= 18; h++) {
      grossA.set(h, 4);
      grossB.set(h, 5);
    }
    const rows = buildFreePlayLeaderboard("stroke_net", holes, [
      { roundPlayerId: "b", displayName: "Bob", playingHandicap: 0, handicapIndex: 0, grossByHole: grossB },
      { roundPlayerId: "a", displayName: "Ann", playingHandicap: 0, handicapIndex: 0, grossByHole: grossA },
    ]);
    expect(rows[0]!.roundPlayerId).toBe("a");
    expect(rows[0]!.netTotal).toBe(72);
    expect(rows[1]!.netTotal).toBe(90);
  });

  it("orders stableford by descending points", () => {
    const holes = holes18UniformPar4();
    const better = new Map<number, number | null>();
    const worse = new Map<number, number | null>();
    for (let h = 1; h <= 18; h++) {
      better.set(h, 3);
      worse.set(h, 5);
    }
    const rows = buildFreePlayLeaderboard("stableford", holes, [
      { roundPlayerId: "w", displayName: "Worse", playingHandicap: 0, handicapIndex: 0, grossByHole: worse },
      { roundPlayerId: "x", displayName: "Better", playingHandicap: 0, handicapIndex: 0, grossByHole: better },
    ]);
    expect(rows[0]!.roundPlayerId).toBe("x");
    expect(rows[0]!.stablefordPoints).toBeGreaterThan(rows[1]!.stablefordPoints!);
  });

  it("excludes pickup holes (null gross) from net and thru", () => {
    const holes = holes18UniformPar4();
    const m = new Map<number, number | null>();
    m.set(1, 4);
    m.set(2, null);
    m.set(3, 5);
    const rows = buildFreePlayLeaderboard("stroke_net", holes, [
      { roundPlayerId: "p", displayName: "Pat", playingHandicap: 0, handicapIndex: 0, grossByHole: m },
    ]);
    expect(rows[0]!.thru).toBe(2);
  });

  it("does not mix data between unrelated player ids (society / roster isolation at domain layer)", () => {
    const holes = holes18UniformPar4();
    const grossA = new Map<number, number | null>([[1, 4]]);
    const grossB = new Map<number, number | null>([[1, 5]]);
    const rows = buildFreePlayLeaderboard("stroke_net", holes, [
      { roundPlayerId: "society-a-player", displayName: "A", playingHandicap: 0, handicapIndex: 0, grossByHole: grossA },
      { roundPlayerId: "society-b-player", displayName: "B", playingHandicap: 0, handicapIndex: 0, grossByHole: grossB },
    ]);
    expect(rows.find((r) => r.roundPlayerId === "society-a-player")?.netTotal).toBe(4);
    expect(rows.find((r) => r.roundPlayerId === "society-b-player")?.netTotal).toBe(5);
  });

  it("supports guest-style duplicate names with stable tie-break", () => {
    const holes = holes18UniformPar4();
    const g = new Map<number, number | null>();
    for (let h = 1; h <= 18; h++) g.set(h, 4);
    const rows = buildFreePlayLeaderboard("stroke_net", holes, [
      { roundPlayerId: "1", displayName: "Guest", playingHandicap: 0, handicapIndex: 0, grossByHole: g },
      { roundPlayerId: "2", displayName: "Guest", playingHandicap: 0, handicapIndex: 0, grossByHole: g },
    ]);
    expect(rows[0]!.displayName).toBe("Guest");
    expect(rows[0]!.roundPlayerId).not.toBe(rows[1]!.roundPlayerId);
  });
});
