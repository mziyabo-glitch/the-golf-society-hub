import { describe, expect, it } from "vitest";
import {
  dayValueForOomFromLeaderboardRow,
  getOomDaySortOrder,
  isOomPointsEvent,
  parseGameBookTodayScore,
  usesMajorStablefordNetTodayScoring,
} from "@/lib/oomEventClassification";

describe("oomEventClassification", () => {
  it("treats major classification as OOM points event", () => {
    expect(isOomPointsEvent({ classification: "major" })).toBe(true);
    expect(isOomPointsEvent({ classification: "oom" })).toBe(true);
    expect(isOomPointsEvent({ classification: "general" })).toBe(false);
  });

  it("parses GameBook Today values", () => {
    expect(parseGameBookTodayScore("E")).toBe(0);
    expect(parseGameBookTodayScore("-6")).toBe(-6);
    expect(parseGameBookTodayScore("+3")).toBe(3);
  });

  it("major stableford NET uses low_wins on Today (not cumulative stableford points)", () => {
    expect(usesMajorStablefordNetTodayScoring("stableford", "major")).toBe(true);
    expect(getOomDaySortOrder("stableford", "major")).toBe("low_wins");
    expect(getOomDaySortOrder("stableford", "oom")).toBe("high_wins");
  });

  it("publish day_value for major stableford uses net-to-par (Today), not stableford_points total", () => {
    const today = dayValueForOomFromLeaderboardRow({
      format: "stableford",
      classification: "major",
      stableford_points: 38,
      net_total: 66,
      par: 72,
    });
    expect(today).toBe(-6);
  });
});
