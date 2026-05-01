import { describe, expect, it } from "vitest";

import type { CourseHoleRow, CourseTee } from "@/lib/db_supabase/courseRepo";
import type { FreePlayRoundBundle } from "@/types/freePlayScorecard";

import { analyzeHoleScoreRowKeys } from "./freePlayHoleScoreDiagnostics";
import { findFirstIncompleteHoleNumber } from "./freePlayHoleResume";
import { getFreePlayStartBlockers } from "./freePlayStartReadiness";
import { mergeHoleGrossIntoBundle } from "./mergeFreePlayBundleHoleScore";
import { buildFreePlayLeaderboard } from "@/lib/scoring/freePlayScoring";
import type { EventHoleSnapshot } from "@/lib/scoring/eventScoringTypes";

const now = "2026-01-01T00:00:00.000Z";

function baseRound(over: Partial<FreePlayRoundBundle["round"]> = {}): FreePlayRoundBundle["round"] {
  return {
    id: "round-1",
    society_id: null,
    created_by_user_id: "u1",
    created_by_member_id: null,
    course_id: "c1",
    course_name: "Test GC",
    tee_id: "tee-1",
    tee_name: "White",
    join_code: "ABC",
    scoring_mode: "hole_by_hole",
    scoring_format: "stroke_net",
    status: "draft",
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

function basePlayer(
  id: string,
  over: Partial<FreePlayRoundBundle["players"][number]> = {},
): FreePlayRoundBundle["players"][number] {
  return {
    id,
    round_id: "round-1",
    player_type: "guest",
    member_id: null,
    user_id: null,
    invite_email: null,
    display_name: "Pat",
    handicap_index: 18.4,
    course_handicap: 18,
    playing_handicap: 18,
    handicap_source: "manual",
    guest_name: null,
    tee_id: null,
    invite_status: "none",
    is_owner: false,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    ...over,
  };
}

function holes18CourseRows(teeId: string, courseId: string): CourseHoleRow[] {
  return Array.from({ length: 18 }, (_, i) => ({
    id: `h-${i + 1}`,
    course_id: courseId,
    tee_id: teeId,
    hole_number: i + 1,
    par: 4,
    yardage: 400,
    stroke_index: i + 1,
  }));
}

function ratedTee(over: Partial<CourseTee> = {}): CourseTee {
  return {
    id: "tee-1",
    course_id: "c1",
    tee_name: "White",
    course_rating: 72,
    slope_rating: 130,
    par_total: 72,
    is_active: true,
    ...over,
  };
}

function holes18Snapshots(): EventHoleSnapshot[] {
  return Array.from({ length: 18 }, (_, i) => ({
    holeNumber: i + 1,
    par: 4,
    yardage: 400,
    strokeIndex: i + 1,
  }));
}

describe("analyzeHoleScoreRowKeys", () => {
  it("detects duplicate round_player_id + hole_number", () => {
    const rows = [
      { round_player_id: "a", hole_number: 1 },
      { round_player_id: "a", hole_number: 1 },
      { round_player_id: "a", hole_number: 2 },
    ];
    const out = analyzeHoleScoreRowKeys(rows);
    expect(out.duplicateKeys).toEqual(["a:1"]);
    expect(out.totalRows).toBe(3);
  });
});

describe("findFirstIncompleteHoleNumber", () => {
  const order = [1, 2, 3, 4, 5];
  const pid = "p1";

  it("returns first hole when no rows", () => {
    expect(findFirstIncompleteHoleNumber(order, [], pid)).toBe(1);
  });

  it("treats null gross as incomplete", () => {
    const rows = [
      {
        id: "1",
        round_id: "r",
        round_player_id: pid,
        hole_number: 1,
        gross_strokes: null as number | null,
        created_at: now,
        updated_at: now,
      },
    ];
    expect(findFirstIncompleteHoleNumber(order, rows, pid)).toBe(1);
  });

  it("advances after scored holes", () => {
    const rows = [1, 2].map((n) => ({
      id: String(n),
      round_id: "r",
      round_player_id: pid,
      hole_number: n,
      gross_strokes: 4,
      created_at: now,
      updated_at: now,
    }));
    expect(findFirstIncompleteHoleNumber(order, rows, pid)).toBe(3);
  });

  it("returns null when round complete for player", () => {
    const rows = order.map((n) => ({
      id: String(n),
      round_id: "r",
      round_player_id: pid,
      hole_number: n,
      gross_strokes: 4,
      created_at: now,
      updated_at: now,
    }));
    expect(findFirstIncompleteHoleNumber(order, rows, pid)).toBeNull();
  });
});

describe("getFreePlayStartBlockers", () => {
  const tee = ratedTee();
  const holes = holes18CourseRows("tee-1", "c1");

  it("is empty when bundle, tee, and holes are valid", () => {
    const bundle: FreePlayRoundBundle = {
      round: baseRound(),
      players: [basePlayer("p1")],
      scores: [],
      holeScores: [],
    };
    expect(getFreePlayStartBlockers({ bundle, teeMeta: tee, holeMeta: holes })).toEqual([]);
  });

  it("requires course, tee, players, and valid HI", () => {
    const bundle: FreePlayRoundBundle = {
      round: baseRound({ course_id: null, tee_id: null }),
      players: [basePlayer("p1", { handicap_index: 99 })],
      scores: [],
      holeScores: [],
    };
    const b = getFreePlayStartBlockers({ bundle, teeMeta: null, holeMeta: [] });
    expect(b.some((m) => m.includes("course"))).toBe(true);
    expect(b.some((m) => m.includes("tee"))).toBe(true);
    expect(b.some((m) => m.includes("handicap"))).toBe(true);
  });

  it("flags fewer than 18 holes", () => {
    const bundle: FreePlayRoundBundle = {
      round: baseRound(),
      players: [basePlayer("p1")],
      scores: [],
      holeScores: [],
    };
    const short = holes.slice(0, 10);
    const b = getFreePlayStartBlockers({ bundle, teeMeta: tee, holeMeta: short });
    expect(b.some((m) => m.includes("18 holes"))).toBe(true);
  });
});

describe("mergeHoleGrossIntoBundle", () => {
  it("inserts one row then updates same logical hole (no duplicate keys)", () => {
    let bundle: FreePlayRoundBundle = {
      round: baseRound(),
      players: [basePlayer("p1")],
      scores: [],
      holeScores: [],
    };
    bundle = mergeHoleGrossIntoBundle(bundle, "p1", 3, 5);
    expect(bundle.holeScores.filter((h) => h.round_player_id === "p1" && h.hole_number === 3)).toHaveLength(1);
    const firstId = bundle.holeScores.find((h) => h.hole_number === 3)!.id;
    bundle = mergeHoleGrossIntoBundle(bundle, "p1", 3, 6);
    const forHole = bundle.holeScores.filter((h) => h.round_player_id === "p1" && h.hole_number === 3);
    expect(forHole).toHaveLength(1);
    expect(forHole[0]!.gross_strokes).toBe(6);
    expect(forHole[0]!.id).toBe(firstId);
  });

  it("updates aggregate holes_played and quick_total", () => {
    let bundle: FreePlayRoundBundle = {
      round: baseRound(),
      players: [basePlayer("p1")],
      scores: [
        {
          id: "s1",
          round_id: "round-1",
          round_player_id: "p1",
          quick_total: null,
          holes_played: 0,
          created_at: now,
          updated_at: now,
        },
      ],
      holeScores: [],
    };
    bundle = mergeHoleGrossIntoBundle(bundle, "p1", 1, 4);
    bundle = mergeHoleGrossIntoBundle(bundle, "p1", 2, 5);
    const s = bundle.scores.find((x) => x.round_player_id === "p1")!;
    expect(s.holes_played).toBe(2);
    expect(s.quick_total).toBe(9);
  });
});

describe("leaderboard after merge (reopen / local state)", () => {
  it("recalculates net when gross map updates", () => {
    const holes = holes18Snapshots();
    let bundle: FreePlayRoundBundle = {
      round: baseRound({ status: "in_progress" }),
      players: [basePlayer("p1", { playing_handicap: 0 })],
      scores: [],
      holeScores: [],
    };
    bundle = mergeHoleGrossIntoBundle(bundle, "p1", 1, 5);
    const gross1 = new Map<number, number | null>([[1, 5]]);
    const lb1 = buildFreePlayLeaderboard("stroke_net", holes, [
      { roundPlayerId: "p1", displayName: "Pat", playingHandicap: 0, handicapIndex: 0, grossByHole: gross1 },
    ]);
    expect(lb1[0]!.netTotal).toBe(5);
    bundle = mergeHoleGrossIntoBundle(bundle, "p1", 1, 4);
    const gross2 = new Map<number, number | null>([[1, 4]]);
    const lb2 = buildFreePlayLeaderboard("stroke_net", holes, [
      { roundPlayerId: "p1", displayName: "Pat", playingHandicap: 0, handicapIndex: 0, grossByHole: gross2 },
    ]);
    expect(lb2[0]!.netTotal).toBe(4);
  });
});
