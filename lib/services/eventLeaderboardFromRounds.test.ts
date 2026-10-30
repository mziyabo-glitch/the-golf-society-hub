import { describe, expect, it } from "vitest";
import { buildLeaderboardFromRoundSummaries } from "./eventLeaderboardFromRounds";

describe("buildLeaderboardFromRoundSummaries", () => {
  it("stableford: complete rounds beat higher incomplete totals; ties share rank", () => {
    const rows = buildLeaderboardFromRoundSummaries("stableford", 2, [
      { player_id: "a", gross_total: 8, net_total: 8, stableford_points: 4, holes_played: 2, course_handicap: null, playing_handicap: null },
      { player_id: "b", gross_total: 6, net_total: 6, stableford_points: 6, holes_played: 1, course_handicap: null, playing_handicap: null },
      { player_id: "c", gross_total: 8, net_total: 8, stableford_points: 4, holes_played: 2, course_handicap: null, playing_handicap: null },
    ]);
    expect(rows.map((r) => r.player_id)).toEqual(["a", "c", "b"]);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[0]!.tie_size).toBe(2);
    expect(rows[1]!.rank).toBe(1);
    expect(rows[2]!.rank).toBe(3);
  });

  it("strokeplay_net: lower net wins among complete rounds", () => {
    const rows = buildLeaderboardFromRoundSummaries("strokeplay_net", 1, [
      { player_id: "x", gross_total: 5, net_total: 5, stableford_points: 0, holes_played: 1, course_handicap: null, playing_handicap: null },
      { player_id: "y", gross_total: 4, net_total: 4, stableford_points: 0, holes_played: 1, course_handicap: null, playing_handicap: null },
    ]);
    expect(rows[0]!.player_id).toBe("y");
    expect(rows[1]!.player_id).toBe("x");
  });

  it("strokeplay_gross: lower gross wins", () => {
    const rows = buildLeaderboardFromRoundSummaries("strokeplay_gross", 1, [
      { player_id: "p", gross_total: 5, net_total: 5, stableford_points: 0, holes_played: 1, course_handicap: null, playing_handicap: null },
      { player_id: "q", gross_total: 4, net_total: 4, stableford_points: 0, holes_played: 1, course_handicap: null, playing_handicap: null },
    ]);
    expect(rows[0]!.player_id).toBe("q");
  });

  it("strokeplay_net: identical net among complete rounds shares rank; order by player_id", () => {
    const rows = buildLeaderboardFromRoundSummaries("strokeplay_net", 2, [
      { player_id: "z", gross_total: 10, net_total: 8, stableford_points: 0, holes_played: 2, course_handicap: null, playing_handicap: null },
      { player_id: "m", gross_total: 9, net_total: 8, stableford_points: 0, holes_played: 2, course_handicap: null, playing_handicap: null },
    ]);
    expect(rows[0]!.rank).toBe(1);
    expect(rows[0]!.tie_size).toBe(2);
    expect(rows.map((r) => r.player_id)).toEqual(["m", "z"]);
  });
});
