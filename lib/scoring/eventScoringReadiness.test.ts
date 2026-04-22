import { describe, expect, it } from "vitest";
import type { EventCourseContext, EventHoleSnapshotRow, EventTeeRatingSnapshot } from "@/types/eventCourseScoring";
import { assertEventScoringReady, validateEventHoleSnapshotSet } from "@/lib/scoring/eventScoringReadiness";

function snap18(): EventHoleSnapshotRow[] {
  return Array.from({ length: 18 }, (_, i) => ({
    id: `s${i + 1}`,
    event_id: "e1",
    hole_number: i + 1,
    par: 4,
    yardage: 350 + i,
    stroke_index: i + 1,
  }));
}

function ctxBase(over: Partial<EventCourseContext> = {}): EventCourseContext {
  const teeSnap: EventTeeRatingSnapshot = {
    teeName: "White",
    courseRating: 72,
    slopeRating: 128,
    parTotal: 72,
  };
  return {
    eventId: "e1",
    courseId: "c1",
    teeId: "t1",
    courseName: "Test",
    tee: null,
    teeRatingSnapshot: teeSnap,
    holes: snap18(),
    lockRow: { course_id: "c1", tee_id: "t1" },
    ...over,
  };
}

describe("EventCourseContext (scoring contract)", () => {
  it("uses immutable hole rows keyed by event_id (event_course_holes shape)", () => {
    const ctx = ctxBase();
    expect(ctx.holes).toHaveLength(18);
    expect(ctx.holes.every((h) => h.event_id === "e1" && typeof h.stroke_index === "number")).toBe(true);
  });
});

describe("validateEventHoleSnapshotSet", () => {
  it("flags bad counts", () => {
    expect(validateEventHoleSnapshotSet(snap18().slice(0, 5)).length).toBeGreaterThan(0);
  });

  it("flags duplicate hole numbers", () => {
    const rows = snap18();
    rows[1] = { ...rows[1]!, hole_number: 1 };
    expect(validateEventHoleSnapshotSet(rows).some((m) => m.includes("Duplicate"))).toBe(true);
  });
});

describe("assertEventScoringReady", () => {
  it("throws when event missing", async () => {
    await expect(
      assertEventScoringReady("missing", {
        getEvent: async () => null,
        getEventCourseContext: async () => null,
      }),
    ).rejects.toThrow(/not found/);
  });

  it("passes when event, snapshots, and holes are valid", async () => {
    const ev = { format: "stableford", courseId: "c1", teeId: "t1" };
    await expect(
      assertEventScoringReady("e1", {
        getEvent: async () => ev,
        getEventCourseContext: async () => ctxBase(),
      }),
    ).resolves.toBeUndefined();
  });

  it("aggregates errors when snapshots incomplete", async () => {
    const ev = { format: "stableford", courseId: "c1", teeId: "t1" };
    await expect(
      assertEventScoringReady("e1", {
        getEvent: async () => ev,
        getEventCourseContext: async () => ctxBase({ holes: [], teeRatingSnapshot: null }),
      }),
    ).rejects.toThrow(/not ready/);
  });
});
