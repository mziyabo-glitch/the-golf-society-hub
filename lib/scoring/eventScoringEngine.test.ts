import { describe, expect, it } from "vitest";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import {
  rankStablefordResults,
  rankStrokeplayLowWins,
  scoreEnteredHolesFromGross,
  scorePlayerRoundFromGross,
} from "@/lib/scoring/eventScoringEngine";

function baseCtx(overrides: Partial<EventScoringContext> = {}): EventScoringContext {
  const holes = Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 400,
    strokeIndex: i + 1,
  }));
  return {
    eventId: "e1",
    societyId: "s1",
    name: "Test event",
    format: "stableford",
    rawFormat: "stableford",
    handicapAllowance: 0.95,
    teeSnapshot: { teeName: "White", courseRating: 72, slopeRating: 113, parTotal: 72 },
    holes,
    players: [
      {
        memberId: "p1",
        displayName: "Player One",
        handicapIndex: 0,
        courseHandicap: 0,
        playingHandicap: 0,
      },
    ],
    ...overrides,
  };
}

function allParsGross(ctx: EventScoringContext, gross: number): Record<number, number> {
  const o: Record<number, number> = {};
  for (const h of ctx.holes) o[h.holeNumber] = gross;
  return o;
}

describe("scorePlayerRoundFromGross", () => {
  it("stableford: net par on all holes → 18 × 2 points", () => {
    const ctx = baseCtx({ format: "stableford", rawFormat: "stableford" });
    const gross = allParsGross(ctx, 4);
    const r = scorePlayerRoundFromGross(ctx, "p1", gross);
    expect(r.kind).toBe("stableford");
    if (r.kind === "stableford") {
      expect(r.totalStablefordPoints).toBe(36);
      expect(r.holes[0]!.stablefordPoints).toBe(2);
    }
  });

  it("strokeplay_net: sums net strokes with strokes received", () => {
    const ctx = baseCtx({
      format: "strokeplay_net",
      rawFormat: "strokeplay_net",
      players: [
        {
          memberId: "p1",
          displayName: "Low",
          handicapIndex: 0,
          courseHandicap: 0,
          playingHandicap: 0,
        },
      ],
    });
    const gross: Record<number, number> = {};
    for (const h of ctx.holes) gross[h.holeNumber] = 5;
    const r = scorePlayerRoundFromGross(ctx, "p1", gross);
    expect(r.kind).toBe("strokeplay_net");
    if (r.kind === "strokeplay_net") {
      expect(r.strokeplay.totalNetStrokes).toBe(18 * 5);
      expect(r.strokeplay.totalGrossStrokes).toBe(18 * 5);
    }
  });

  it("strokeplay_gross: ignores handicap and totals gross", () => {
    const ctx = baseCtx({
      format: "strokeplay_gross",
      rawFormat: "strokeplay_gross",
      players: [
        {
          memberId: "p1",
          displayName: "Grosser",
          handicapIndex: 20,
          courseHandicap: 22,
          playingHandicap: 21,
        },
      ],
    });
    const gross: Record<number, number> = {};
    for (const h of ctx.holes) gross[h.holeNumber] = 4;
    const r = scorePlayerRoundFromGross(ctx, "p1", gross);
    expect(r.kind).toBe("strokeplay_gross");
    if (r.kind === "strokeplay_gross") {
      expect(r.strokeplay.totalGrossStrokes).toBe(72);
      expect(r.strokeplay.totalNetStrokes).toBeNull();
      expect(r.strokeplay.holes[0]!.strokesReceived).toBe(0);
    }
  });

  it("stableford with high playing handicap still yields valid points", () => {
    const ctx = baseCtx({
      players: [
        {
          memberId: "p1",
          displayName: "High",
          handicapIndex: 36,
          courseHandicap: 40,
          playingHandicap: 38,
        },
      ],
    });
    const gross: Record<number, number> = {};
    for (const h of ctx.holes) gross[h.holeNumber] = 4;
    const r = scorePlayerRoundFromGross(ctx, "p1", gross);
    expect(r.kind).toBe("stableford");
    if (r.kind === "stableford") {
      expect(r.holes.length).toBe(18);
      expect(r.totalStablefordPoints).toBeGreaterThan(0);
    }
  });
});

describe("scoreEnteredHolesFromGross", () => {
  it("partial entry: totals sum entered holes only; allocation uses full snapshot", () => {
    const holes = [
      { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
      { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
    ];
    const ctx = baseCtx({
      holes,
      players: [
        {
          memberId: "p1",
          displayName: "H3",
          handicapIndex: 0,
          courseHandicap: 3,
          playingHandicap: 3,
        },
      ],
    });
    const r = scoreEnteredHolesFromGross(ctx, "p1", { 2: 4 });
    expect(r.holesPlayed).toBe(1);
    expect(r.grossTotal).toBe(4);
    expect(r.enteredHoles[0]!.strokesReceived).toBe(1);
    expect(r.enteredHoles[0]!.netStrokes).toBe(3);
    expect(r.enteredHoles[0]!.stablefordPoints).toBe(3);
    expect(r.isComplete).toBe(false);
  });

  it("strokeplay_gross: no strokes received; stableford points zero", () => {
    const holes = [
      { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
      { holeNumber: 2, par: 5, yardage: 500, strokeIndex: 2 },
    ];
    const ctx = baseCtx({
      format: "strokeplay_gross",
      rawFormat: "strokeplay_gross",
      holes,
      players: [
        {
          memberId: "p1",
          displayName: "G",
          handicapIndex: 10,
          courseHandicap: 12,
          playingHandicap: 11,
        },
      ],
    });
    const r = scoreEnteredHolesFromGross(ctx, "p1", { 1: 5 });
    expect(r.enteredHoles[0]!.strokesReceived).toBe(0);
    expect(r.enteredHoles[0]!.netStrokes).toBe(5);
    expect(r.enteredHoles[0]!.stablefordPoints).toBe(0);
  });

  it("full snapshot entry sets isComplete", () => {
    const ctx = baseCtx({
      holes: [
        { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
        { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
      ],
    });
    const r = scoreEnteredHolesFromGross(ctx, "p1", { 1: 4, 2: 4 });
    expect(r.isComplete).toBe(true);
    expect(r.holesPlayed).toBe(2);
  });

  it("throws for unknown hole key", () => {
    const ctx = baseCtx({
      holes: [{ holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 }],
    });
    expect(() => scoreEnteredHolesFromGross(ctx, "p1", { 9: 4 })).toThrow("not on the event hole snapshot");
  });
});

describe("rankings", () => {
  it("rankStablefordResults: highest first", () => {
    const r = rankStablefordResults([
      { playerId: "a", totalStablefordPoints: 30 },
      { playerId: "b", totalStablefordPoints: 40 },
    ]);
    expect(r[0]!.playerId).toBe("b");
  });

  it("rankStrokeplayLowWins: lowest first", () => {
    const r = rankStrokeplayLowWins([
      { playerId: "a", total: 75, kind: "net" },
      { playerId: "b", total: 72, kind: "net" },
    ]);
    expect(r[0]!.playerId).toBe("b");
  });
});
