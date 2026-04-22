import { describe, expect, it, vi } from "vitest";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { EventCourseContext } from "@/types/eventCourseScoring";
import { loadEventScoringContext } from "@/lib/scoring/loadEventScoringContext";
import { calculateCourseHandicap } from "@/lib/scoring/handicap";

describe("loadEventScoringContext", () => {
  it("builds context from snapshot only (no live tee) and computes CH from event_courses snapshot", async () => {
    const ev: EventDoc = {
      id: "ev1",
      society_id: "soc1",
      name: "Comp",
      format: "medal",
      classification: "general",
      playerIds: ["m1"],
      handicapAllowance: 0.95,
    };

    const ctx: EventCourseContext = {
      eventId: "ev1",
      courseId: "c1",
      teeId: "t1",
      courseName: "Test Course",
      tee: null,
      teeRatingSnapshot: {
        teeName: "White",
        courseRating: 72,
        slopeRating: 113,
        parTotal: 72,
      },
      holes: Array.from({ length: 18 }, (_, i) => ({
        id: `h${i}`,
        event_id: "ev1",
        hole_number: i + 1,
        par: 4,
        yardage: 400,
        stroke_index: i + 1,
      })),
      lockRow: { course_id: "c1", tee_id: "t1" },
    };

    const m1: MemberDoc = {
      id: "m1",
      society_id: "soc1",
      handicap_index: 10,
      handicapIndex: 10,
      name: "Member",
    };

    const getEvent = vi.fn(async () => ev);
    const getEventCourseContextForScoring = vi.fn(async () => ctx);
    const getMembersByIds = vi.fn(async () => [m1]);

    const out = await loadEventScoringContext("ev1", {
      getEvent,
      getEventCourseContextForScoring,
      getMembersByIds,
    });

    expect(out.format).toBe("strokeplay_net");
    expect(out.rawFormat).toBe("medal");
    expect(getEventCourseContextForScoring).toHaveBeenCalledWith("ev1");

    const ch = calculateCourseHandicap(10, 113, 72, 72);
    expect(out.players[0]!.courseHandicap).toBe(ch);
    expect(out.players[0]!.playingHandicap).toBe(Math.round(ch * 0.95));
    expect(out.teeSnapshot.courseRating).toBe(72);
    expect(out.holes).toHaveLength(18);
  });
});
