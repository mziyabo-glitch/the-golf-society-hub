import { describe, expect, it } from "vitest";
import { buildTeeSheetPages } from "@/lib/teeSheet/buildTeeSheetPages";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { TEE_SHEET_GROUPS_PER_PAGE } from "@/lib/teeSheet/teeSheetPageLimits";

function makePayload(playerCount: number): TeeSheetData {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p-${i + 1}`,
    name: `Player ${i + 1}`,
    handicapIndex: 10,
    gender: "male" as const,
    group: i + 1,
    teeTime: `12:${String(i).padStart(2, "0")}`,
  }));

  return {
    societyName: "Test Society",
    manCo: { captain: null, secretary: null, treasurer: null, handicapper: null },
    eventName: "Test Event",
    eventDate: "2026-06-25",
    courseName: "Test Course",
    startTime: "12:00",
    teeTimeInterval: 7,
    players,
    preGrouped: true,
  };
}

describe("buildTeeSheetPages", () => {
  it("keeps all groups across multiple pages (no 12-group truncation)", () => {
    const pages = buildTeeSheetPages(makePayload(13));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(TEE_SHEET_GROUPS_PER_PAGE);
    expect(pages[1]).toHaveLength(1);
    expect(pages[1]?.[0]?.groupNumber).toBe(13);
    expect(pages.flat().map((g) => g.groupNumber)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });

  it("returns a single page for 12 or fewer groups", () => {
    const pages = buildTeeSheetPages(makePayload(12));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(12);
  });
});
