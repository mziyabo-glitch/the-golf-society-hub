import { describe, expect, it } from "vitest";
import {
  eventCalendarDateKey,
  findTodayScorecardEvent,
  hasScorecardTabForSociety,
  todayCalendarDateKey,
} from "@/lib/matchday/scorecardMatchday";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";

describe("scorecardMatchday", () => {
  it("parses calendar date key", () => {
    expect(eventCalendarDateKey("2026-04-17")).toBe("2026-04-17");
    expect(eventCalendarDateKey("2026-04-17T12:00:00Z")).toBe("2026-04-17");
    expect(eventCalendarDateKey(null)).toBe(null);
  });

  it("finds today incomplete event", () => {
    const today = todayCalendarDateKey();
    const ev = { id: "1", name: "Open", date: today, isCompleted: false } as EventDoc;
    expect(findTodayScorecardEvent([ev])?.id).toBe("1");
    expect(hasScorecardTabForSociety([ev])).toBe(true);
  });

  it("ignores completed or wrong day", () => {
    const today = todayCalendarDateKey();
    const past = "2020-01-01";
    expect(findTodayScorecardEvent([{ id: "a", name: "X", date: past, isCompleted: false } as EventDoc])).toBe(null);
    expect(findTodayScorecardEvent([{ id: "b", name: "Y", date: today, isCompleted: true } as EventDoc])).toBe(null);
  });
});
