import { describe, expect, it } from "vitest";
import {
  buildInfoCards,
  buildPosterHeader,
  formatCompetitionLine,
  normalizeCompetitionHoles,
  stripRtsBranding,
} from "@/lib/teeSheet/teeSheetPosterMeta";
import {
  compactTeeRowLabel,
  hasManualTeeOverride,
  needsTeePolicyConfirmation,
  resolveTeeAssignment,
  teeIndicatorForAssignment,
  teeSettingsForAssignment,
} from "@/lib/teeSheet/teeAssignment";
import type { TeeSheetData } from "@/lib/teeSheetPdf";
import { calcCourseHandicap, calcPlayingHandicap } from "@/lib/whs";

function makePayload(overrides: Partial<TeeSheetData>): TeeSheetData {
  return {
    societyName: "M4 Fairway",
    manCo: { captain: null, secretary: null, treasurer: null, handicapper: null },
    eventName: "OOM 3 - MEON VALLEY",
    eventDate: "2026-06-21",
    courseName: "Meon Valley Golf Club",
    format: "stableford",
    teeName: "White",
    ladiesTeeName: "Red",
    teeSettings: { par: 72, slopeRating: 128, courseRating: 71.6 },
    ladiesTeeSettings: { par: 72, slopeRating: 124, courseRating: 73.2 },
    handicapAllowance: 0.95,
    nearestPinHoles: [3, 7],
    longestDriveHoles: [9],
    players: [],
    ...overrides,
  };
}

describe("tee sheet poster payload metadata", () => {
  it("uses Meon payload values in header and info cards", () => {
    const data = makePayload({});
    const header = buildPosterHeader(data);
    const infoCards = buildInfoCards(data);

    expect(header.title).toBe("OOM 3 - MEON VALLEY");
    expect(header.badge).toBe("Stableford");
    expect(infoCards[1]?.value).toContain("Meon Valley Golf Club");
    expect(infoCards[1]?.value).toContain("Stableford");
  });

  it("uses alternate event and course from payload", () => {
    const data = makePayload({
      eventName: "Summer Open - Sandford",
      courseName: "Sandford Springs",
      format: "match_play",
    });
    const header = buildPosterHeader(data);
    const infoCards = buildInfoCards(data);

    expect(header.title).toBe("Summer Open - Sandford");
    expect(header.badge).toBe("Match play");
    expect(infoCards[1]?.value).toContain("Sandford Springs");
    expect(infoCards[1]?.value).toContain("Match play");
  });

  it("strips RTS branding from poster title", () => {
    expect(stripRtsBranding("OOM 3 - MEON VALLEY RTS")).toBe("OOM 3 - MEON VALLEY");
    expect(stripRtsBranding("OOM 3 - Meon Valley (RTS Event)")).toBe("OOM 3 - Meon Valley");
    expect(stripRtsBranding("RTS | Summer Open")).toBe("Summer Open");
    expect(buildPosterHeader(makePayload({ eventName: "OOM 3 - MEON VALLEY RTS" })).title).toBe(
      "OOM 3 - MEON VALLEY",
    );
  });

  it("normalizes competition hole formats deterministically", () => {
    expect(normalizeCompetitionHoles([7, "7", 3, "x", 25, 1])).toEqual([1, 3, 7]);
    expect(formatCompetitionLine("7, 3, 3")).toBe("Holes 3, 7");
    expect(formatCompetitionLine({ holes: ["9"] })).toBe("Hole 9");
    expect(formatCompetitionLine(null)).toBe("Not set");
  });
});

describe("tee assignment and PH rules", () => {
  it("female member is always assigned ladies tee", () => {
    const assignment = resolveTeeAssignment({
      id: "m-2",
      name: "Nto",
      handicapIndex: 14.2,
      gender: "female",
      teeAssignment: "men",
    });
    expect(assignment).toBe("ladies");
  });

  it("female guest with ladies tee renders red indicator", () => {
    const data = makePayload({});
    const assignment = resolveTeeAssignment({
      id: "guest-1",
      name: "Dorcus",
      handicapIndex: 18.2,
      gender: "female",
      teeAssignment: "ladies",
    });
    const indicator = teeIndicatorForAssignment(data, assignment);
    expect(indicator.label).toBe("🔴 Red");
    expect(indicator.color).toBe("#C1121F");
  });

  it("uses compact row labels for tee indicators", () => {
    expect(compactTeeRowLabel("ladies")).toBe("🔴 Red");
    expect(compactTeeRowLabel("men")).toBe("🟡 Yellow");
    expect(compactTeeRowLabel(null)).toBe("Tee TBC");
  });

  it("female guest PH uses ladies tee settings", () => {
    const data = makePayload({});
    const assignment = resolveTeeAssignment({
      id: "guest-1",
      name: "Dorcus",
      handicapIndex: 18.2,
      gender: "female",
      teeAssignment: "ladies",
    });
    const tee = teeSettingsForAssignment(data, assignment);
    const courseHandicap = calcCourseHandicap(18.2, tee);
    const playingHandicap = calcPlayingHandicap(courseHandicap, data.handicapAllowance ?? 0.95);
    const menCourseHandicap = calcCourseHandicap(18.2, data.teeSettings ?? null);

    expect(tee).toEqual(data.ladiesTeeSettings);
    expect(courseHandicap).not.toBe(menCourseHandicap);
    expect(playingHandicap).not.toBeNull();
  });

  it("missing tee does not default to yellow", () => {
    const data = makePayload({});
    const assignment = resolveTeeAssignment({
      id: "guest-2",
      name: "Guest TBC",
      handicapIndex: 22,
      gender: null,
      teeAssignment: null,
    });
    const tee = teeSettingsForAssignment(data, assignment);
    const indicator = teeIndicatorForAssignment(data, assignment);
    const courseHandicap = calcCourseHandicap(22, tee);

    expect(assignment).toBeNull();
    expect(tee).toBeNull();
    expect(indicator.label).toBe("Tee TBC");
    expect(courseHandicap).toBeNull();
  });

  it("unknown member displays Tee TBC", () => {
    const data = makePayload({});
    const assignment = resolveTeeAssignment({
      id: "m-unknown",
      name: "Unknown Member",
      handicapIndex: 17.1,
      gender: null,
      teeAssignment: null,
    });
    const indicator = teeIndicatorForAssignment(data, assignment);
    expect(indicator.label).toBe("Tee TBC");
  });

  it("editor warning state triggers when tee policy missing", () => {
    expect(needsTeePolicyConfirmation({ gender: null, teeAssignment: null })).toBe(true);
    expect(needsTeePolicyConfirmation({ gender: "female", teeAssignment: "ladies" })).toBe(false);
  });

  it("manual override indicator visibility logic works", () => {
    expect(hasManualTeeOverride({ manualOverride: true })).toBe(true);
    expect(hasManualTeeOverride({ manualOverride: false })).toBe(false);
  });

  it("changing guest sex to female updates tee and PH basis", () => {
    const data = makePayload({});
    const assignmentBefore = resolveTeeAssignment({
      id: "guest-5",
      name: "Guest",
      handicapIndex: 20.3,
      gender: null,
      teeAssignment: null,
    });
    const teeBefore = teeSettingsForAssignment(data, assignmentBefore);
    const phBefore = calcPlayingHandicap(calcCourseHandicap(20.3, teeBefore), data.handicapAllowance ?? 0.95);
    const assignmentAfter = resolveTeeAssignment({
      id: "guest-5",
      name: "Guest",
      handicapIndex: 20.3,
      gender: "female",
      teeAssignment: null,
    });
    const teeAfter = teeSettingsForAssignment(data, assignmentAfter);
    const phAfter = calcPlayingHandicap(calcCourseHandicap(20.3, teeAfter), data.handicapAllowance ?? 0.95);
    expect(assignmentBefore).toBeNull();
    expect(assignmentAfter).toBe("ladies");
    expect(phBefore).toBeNull();
    expect(teeAfter).toEqual(data.ladiesTeeSettings);
    expect(phAfter).not.toBeNull();
  });

  it("male rows still render men indicator", () => {
    const data = makePayload({ teeName: "Yellow" });
    const assignment = resolveTeeAssignment({
      id: "m-1",
      name: "Member",
      handicapIndex: 9.4,
      gender: "male",
      teeAssignment: "men",
    });
    const indicator = teeIndicatorForAssignment(data, assignment);
    expect(indicator.label).toBe("🟡 Yellow");
    expect(indicator.color).toBe("#E0B100");
  });

  it("male PH uses men's tee settings", () => {
    const data = makePayload({});
    const assignment = resolveTeeAssignment({
      id: "m-1",
      name: "Member",
      handicapIndex: 9.4,
      gender: "male",
      teeAssignment: "ladies",
    });
    const tee = teeSettingsForAssignment(data, assignment);
    const courseHandicap = calcCourseHandicap(9.4, tee);
    const ladiesCourseHandicap = calcCourseHandicap(9.4, data.ladiesTeeSettings ?? null);

    expect(assignment).toBe("men");
    expect(tee).toEqual(data.teeSettings);
    expect(courseHandicap).not.toBe(ladiesCourseHandicap);
  });
});
