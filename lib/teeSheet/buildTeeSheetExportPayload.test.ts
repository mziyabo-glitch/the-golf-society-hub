import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/teeSheet/canonicalTeeSheet", () => ({
  buildTeeSheetDataFromCanonical: (
    canonical: {
      groups: { groupNumber: number; teeTime: string; players: { id: string; name: string; handicapIndex: number | null }[] }[];
      isJoint: boolean;
      jointParticipatingSocieties?: { society_id: string; society_name?: string | null }[];
      event: { name: string; date: string | null; courseName: string | null };
    },
    opts: {
      societyId?: string;
      societyName: string;
      jointSocieties?: { societyId: string; societyName: string }[];
    },
  ) => ({
    societyId: opts.societyId,
    societyName: opts.societyName,
    jointSocieties: opts.jointSocieties,
    manCo: { captain: null, secretary: null, treasurer: null, handicapper: null },
    eventName: canonical.event.name,
    eventDate: canonical.event.date,
    courseName: canonical.event.courseName,
    preGrouped: true,
    players: canonical.groups.flatMap((g) =>
      g.players.map((p) => ({
        id: p.id,
        name: p.name,
        handicapIndex: p.handicapIndex,
        gender: null,
        group: g.groupNumber,
        teeTime: g.teeTime,
      })),
    ),
  }),
}));

import { buildTeeSheetExportPayload } from "@/lib/teeSheet/buildTeeSheetExportPayload";

type CanonicalTeeSheetResult = {
  eventId: string;
  source: "tee_groups" | "joint_entries" | "computed_fallback";
  isJoint: boolean;
  published: boolean;
  event: { id: string; name: string; date: string; society_id: string; courseName: string };
  jointParticipatingSocieties?: { society_id: string; society_name?: string | null }[];
  groups: {
    groupNumber: number;
    teeTime: string;
    players: { id: string; name: string; handicapIndex: number | null }[];
  }[];
};

const manCo = { captain: null, secretary: null, treasurer: null, handicapper: null };

function canonical(overrides: Partial<CanonicalTeeSheetResult> = {}): CanonicalTeeSheetResult {
  return {
    eventId: "ev1",
    source: "tee_groups",
    isJoint: false,
    published: true,
    event: {
      id: "ev1",
      name: "OOM 4",
      date: "2026-06-01",
      society_id: "soc1",
      courseName: "Millbrook",
    } as CanonicalTeeSheetResult["event"],
    groups: [
      {
        groupNumber: 2,
        teeTime: "08:10",
        players: [
          { id: "b", name: "Bob", handicapIndex: 12 },
          { id: "a", name: "Ann", handicapIndex: 8 },
        ],
      },
      {
        groupNumber: 1,
        teeTime: "08:00",
        players: [{ id: "c", name: "Cal", handicapIndex: 20 }],
      },
    ],
    ...overrides,
  };
}

describe("buildTeeSheetExportPayload", () => {
  it("preserves persisted canonical group order and tee times", () => {
    const payload = buildTeeSheetExportPayload({
      canonical: canonical(),
      societyId: "soc1",
      societyName: "M4",
      manCo,
      nearestPinHoles: [3],
      longestDriveHoles: [10],
      startTime: "08:00",
      teeTimeInterval: 10,
      genderHints: [
        { id: "b", gender: "male", teeAssignment: "men", playingHandicapSnapshot: 11 },
        { id: "a", gender: "female", teeAssignment: "ladies", playingHandicapSnapshot: 7 },
        { id: "c", gender: "male", teeAssignment: "men", playingHandicapSnapshot: 18 },
      ],
    });

    expect(payload.preGrouped).toBe(true);
    expect(payload.players.map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(payload.players.map((p) => p.group)).toEqual([2, 2, 1]);
    expect(payload.players.find((p) => p.id === "a")?.teeAssignment).toBe("ladies");
    expect(payload.players.find((p) => p.id === "a")?.playingHandicapSnapshot).toBe(7);
  });

  it("uses joint society label in export header", () => {
    const payload = buildTeeSheetExportPayload({
      canonical: canonical({
        isJoint: true,
        source: "joint_entries",
        jointParticipatingSocieties: [
          { society_id: "m4", society_name: "M4" },
          { society_id: "zgs", society_name: "ZGS" },
        ],
      }),
      societyId: "m4",
      societyName: "Joint: M4 & ZGS",
      manCo,
      nearestPinHoles: null,
      longestDriveHoles: null,
      startTime: "12:00",
      teeTimeInterval: 10,
      genderHints: [],
    });
    expect(payload.jointSocieties?.map((s) => s.societyName)).toEqual(["M4", "ZGS"]);
  });
});
