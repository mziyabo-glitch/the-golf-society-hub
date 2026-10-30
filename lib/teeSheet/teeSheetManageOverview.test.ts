import { describe, expect, it } from "vitest";
import { computeTeeSheetManageOverview } from "./teeSheetManageOverview";

describe("computeTeeSheetManageOverview", () => {
  it("counts assigned vs unassigned bucket and pool remainder", () => {
    const stats = computeTeeSheetManageOverview({
      registeredCount: 12,
      paidAttendeeCount: 10,
      groups: [
        { groupNumber: 0, players: [{ id: "a" }] },
        { groupNumber: 1, players: [{ id: "b" }, { id: "c" }] },
        { groupNumber: 2, players: [{ id: "d" }] },
      ],
      poolRemainingCount: 2,
      isDirty: false,
      lastSavedAt: null,
      teeTimePublishedAt: null,
    });
    expect(stats.assignedCount).toBe(3);
    expect(stats.unassignedCount).toBe(3);
    expect(stats.onSheetCount).toBe(4);
    expect(stats.registeredCount).toBe(12);
    expect(stats.paidCount).toBe(10);
  });

  it("surfaces unsaved and published draft labels", () => {
    const dirty = computeTeeSheetManageOverview({
      registeredCount: 4,
      paidAttendeeCount: 4,
      groups: [{ groupNumber: 1, players: [{ id: "x" }] }],
      poolRemainingCount: 0,
      isDirty: true,
      lastSavedAt: null,
      teeTimePublishedAt: "2026-06-01T08:00:00Z",
    });
    expect(dirty.draftLabel).toMatch(/Unsaved changes/i);

    const published = computeTeeSheetManageOverview({
      registeredCount: 4,
      paidAttendeeCount: 4,
      groups: [{ groupNumber: 1, players: [{ id: "x" }] }],
      poolRemainingCount: 0,
      isDirty: false,
      lastSavedAt: null,
      teeTimePublishedAt: "2026-06-01T08:00:00Z",
    });
    expect(published.draftLabel).toMatch(/Published/i);
  });
});
