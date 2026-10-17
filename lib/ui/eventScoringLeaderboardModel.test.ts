import { describe, expect, it } from "vitest";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";
import {
  leaderboardColumnDefs,
  leaderboardRowCellArray,
  leaderboardRowCells,
} from "@/lib/ui/eventScoringLeaderboardModel";

const sampleRow = (over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  player_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  rank: 1,
  tie_size: 2,
  gross_total: 80,
  net_total: 72,
  stableford_points: 36,
  holes_played: 18,
  expected_holes: 18,
  round_complete: true,
  eligible_for_primary_rank: true,
  course_handicap: 8,
  playing_handicap: 8,
  ...over,
});

describe("eventScoringLeaderboardModel", () => {
  it("stableford columns include points before net", () => {
    const defs = leaderboardColumnDefs("stableford");
    expect(defs.map((d) => d.key)).toContain("stableford_points");
    expect(defs.findIndex((d) => d.key === "stableford_points")).toBeLessThan(
      defs.findIndex((d) => d.key === "net_total"),
    );
  });

  it("row cells surface tie size and complete card", () => {
    const pid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const c = leaderboardRowCells("stableford", sampleRow({ tie_size: 3, player_id: pid }), { [pid]: "Alex" });
    expect(c.tie).toBe("3");
    expect(c.rank).toBe("1");
    expect(c.player).toBe("Alex");
    expect(c.card).toBe("Complete");
  });

  it("leaderboardRowCellArray order matches column defs (rendering contract)", () => {
    const row = sampleRow({ tie_size: 1 });
    const defs = leaderboardColumnDefs("strokeplay_net");
    const arr = leaderboardRowCellArray("strokeplay_net", row, undefined);
    expect(arr).toHaveLength(defs.length);
    expect(arr[0]).toBe("1");
    expect(arr[1]).toBe("—");
  });

  it("optional OOM column is wired when requested", () => {
    const pid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const defs = leaderboardColumnDefs("stableford", { includeOomPointsColumn: true });
    expect(defs.some((d) => d.key === "oom_points")).toBe(true);
    const row = sampleRow({ player_id: pid });
    const cells = leaderboardRowCells("stableford", row, { [pid]: "Alex" }, { oomPointsByPlayerId: { [pid]: 16.5 } });
    expect(cells.oom_points).toBe("16.5");
  });
});
