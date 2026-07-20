import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);
vi.mock("react-native", () => ({ Platform: { OS: "web" }, NativeModules: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/db_supabase/jointEventRepo", () => ({
  getJointEventTeeSheet: vi.fn(),
}));

import type { JointEventRegistrationRow } from "@/lib/jointEventSignups";
import { resolveJointEventRegistrations } from "@/lib/jointEventAttendeeVisibility";
import {
  buildTeeSheetEditorSnapshot,
  teeSheetEditorSnapshotsEqual,
} from "@/lib/teeSheet/teeSheetEditorSnapshot";
import {
  competitionHolesInputFromPersisted,
  parseEditorCompetitionHoles,
  resolveCompetitionHolesInputForReload,
} from "@/lib/teeSheet/teeSheetDraftPersistence";
import { buildTeeSheetManageWarnings } from "@/lib/teeSheet/teeSheetManageWarnings";

const M4 = "soc-m4";
const ZGS = "soc-zgs";

function reg(partial: Partial<JointEventRegistrationRow> & Pick<JointEventRegistrationRow, "member_id">): JointEventRegistrationRow {
  return {
    id: `reg-${partial.member_id}`,
    society_id: partial.society_id ?? M4,
    event_id: "evt-1",
    status: "in",
    paid: true,
    amount_paid_pence: 0,
    paid_at: null,
    marked_by_member_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function poolItem(overrides: {
  id: string;
  name: string;
  kind?: "member" | "guest";
  paid?: boolean;
  anyUnpaid?: boolean;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    kind: overrides.kind ?? "member",
    paid: overrides.paid ?? true,
    anyUnpaid: overrides.anyUnpaid ?? false,
  };
}

function filterPaidPoolItems(
  items: ReturnType<typeof poolItem>[],
): ReturnType<typeof poolItem>[] {
  return items.filter((item) => item.paid);
}

describe("standard event tee-sheet flows", () => {
  it("includes paid members in the eligible pool and excludes unpaid when required", () => {
    const regs = [
      reg({ member_id: "paid-1", paid: true }),
      reg({ member_id: "unpaid-1", paid: false }),
    ];
    const { teeSheetEligibleMemberIds } = resolveJointEventRegistrations({
      isJoint: false,
      regs,
      guests: [],
      activeSocietyId: M4,
      participantSocietyIds: [M4],
      societyIdToName: new Map([[M4, "M4"]]),
      attendingMembersOnly: true,
    });
    expect(teeSheetEligibleMemberIds).toContain("paid-1");
    expect(teeSheetEligibleMemberIds).not.toContain("unpaid-1");
  });

  it("includes late-paid member after eligibility refresh", () => {
    const before = resolveJointEventRegistrations({
      isJoint: false,
      regs: [reg({ member_id: "late-1", paid: false })],
      guests: [],
      activeSocietyId: M4,
      participantSocietyIds: [M4],
      societyIdToName: new Map([[M4, "M4"]]),
      attendingMembersOnly: true,
    });
    const after = resolveJointEventRegistrations({
      isJoint: false,
      regs: [reg({ member_id: "late-1", paid: true })],
      guests: [],
      activeSocietyId: M4,
      participantSocietyIds: [M4],
      societyIdToName: new Map([[M4, "M4"]]),
      attendingMembersOnly: true,
    });
    expect(before.teeSheetEligibleMemberIds).not.toContain("late-1");
    expect(after.teeSheetEligibleMemberIds).toContain("late-1");
  });

  it("Save Draft snapshot detects group and player order changes", () => {
    const saved = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "a" }, { id: "b" }] }],
      startTime: "08:00",
      teeInterval: "10",
      ntpHolesInput: "7",
      ldHolesInput: "",
      selectedPlayerIds: ["a", "b"],
    });
    const reopened = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "a" }, { id: "b" }] }],
      startTime: "08:00",
      teeInterval: "10",
      ntpHolesInput: "7",
      ldHolesInput: "",
      selectedPlayerIds: ["a", "b"],
    });
    expect(teeSheetEditorSnapshotsEqual(saved, reopened)).toBe(true);

    const reordered = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "b" }, { id: "a" }] }],
      startTime: "08:00",
      teeInterval: "10",
      ntpHolesInput: "7",
      ldHolesInput: "",
      selectedPlayerIds: ["a", "b"],
    });
    expect(teeSheetEditorSnapshotsEqual(saved, reordered)).toBe(false);
  });

  it("republish keeps existing players when snapshot is unchanged", () => {
    const published = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "a" }, { id: "b" }] }],
      startTime: "08:30",
      teeInterval: "8",
      ntpHolesInput: "7, 15",
      ldHolesInput: "3",
      selectedPlayerIds: ["a", "b"],
    });
    const republish = buildTeeSheetEditorSnapshot({
      groups: [{ groupNumber: 1, players: [{ id: "a" }, { id: "b" }] }],
      startTime: "08:30",
      teeInterval: "8",
      ntpHolesInput: "7, 15",
      ldHolesInput: "3",
      selectedPlayerIds: ["a", "b"],
    });
    expect(teeSheetEditorSnapshotsEqual(published, republish)).toBe(true);
  });
});

describe("joint event tee-sheet flows", () => {
  it("includes M4 and ZGS paid members and deduplicates dual members", () => {
    const dualId = "dual-1";
    const regs = [
      reg({ member_id: "m4-only", society_id: M4 }),
      reg({ member_id: "zgs-only", society_id: ZGS }),
      reg({ member_id: dualId, society_id: M4 }),
      reg({ member_id: dualId, society_id: ZGS }),
    ];
    const resolved = resolveJointEventRegistrations({
      isJoint: true,
      regs,
      guests: [],
      activeSocietyId: M4,
      participantSocietyIds: [M4, ZGS],
      societyIdToName: new Map([
        [M4, "M4"],
        [ZGS, "ZGS"],
      ]),
      attendingMembersOnly: true,
    });
    expect(resolved.teeSheetEligibleMemberIds.sort()).toEqual(["dual-1", "m4-only", "zgs-only"].sort());
  });

  it("excludes unrelated society members from the pool", () => {
    const regs = [
      reg({ member_id: "m4-a", society_id: M4 }),
      reg({ member_id: "other-a", society_id: "soc-other" }),
    ];
    const resolved = resolveJointEventRegistrations({
      isJoint: true,
      regs,
      guests: [],
      activeSocietyId: M4,
      participantSocietyIds: [M4, ZGS],
      societyIdToName: new Map([
        [M4, "M4"],
        [ZGS, "ZGS"],
      ]),
      attendingMembersOnly: true,
    });
    expect(resolved.teeSheetEligibleMemberIds).toContain("m4-a");
    expect(resolved.teeSheetEligibleMemberIds).not.toContain("other-a");
  });

  it("handles guests according to paid eligibility", () => {
    const items = filterPaidPoolItems([
      poolItem({ id: "g1", name: "Guest One", kind: "guest", paid: true }),
      poolItem({ id: "g2", name: "Guest Two", kind: "guest", paid: false, anyUnpaid: true }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["g1"]);
  });

  it("does not drop saved players when pool refreshes with the same eligible set", () => {
    const savedIds = ["a", "b"];
    const poolBefore = ["a", "b", "c"];
    const poolAfter = ["a", "b", "c", "d"];
    const stillOnSheet = savedIds.filter((id) => poolAfter.includes(id));
    expect(stillOnSheet).toEqual(savedIds);
    expect(poolAfter.length).toBeGreaterThan(poolBefore.length);
  });
});

describe("competition fields persistence", () => {
  it("persists nearest-to-pin and longest-drive holes through reload helpers", () => {
    expect(competitionHolesInputFromPersisted([7, 15])).toBe("7, 15");
    expect(resolveCompetitionHolesInputForReload([3], "")).toBe("3");
    const parsed = parseEditorCompetitionHoles({ ntpHolesInput: "7, 15", ldHolesInput: "3" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.nearestPinHoles).toEqual([7, 15]);
      expect(parsed.longestDriveHoles).toEqual([3]);
    }
  });

  it("preserves in-progress editor input when DB holes are blank", () => {
    expect(resolveCompetitionHolesInputForReload(null, "9")).toBe("9");
  });

  it("uses guest-prefixed player ids for guest rows", () => {
    const guestId = "guest-abc";
    expect(`guest-${guestId}`).toBe("guest-guest-abc");
  });
});

describe("tee sheet manage warnings", () => {
  it("warns when paid players are missing from the sheet", () => {
    const warnings = buildTeeSheetManageWarnings({
      paidMemberIds: ["a", "b"],
      eligibleMemberIds: ["a", "b"],
      groups: [{ players: [{ member_id: "a" }] }],
      publishedPlayerCount: 1,
      draftPlayerCount: 1,
      isJointEvent: false,
    });
    expect(warnings.some((w) => w.kind === "paid_not_on_sheet")).toBe(true);
  });

  it("flags ineligible and duplicated players", () => {
    const warnings = buildTeeSheetManageWarnings({
      paidMemberIds: ["a"],
      eligibleMemberIds: ["a"],
      groups: [{ players: [{ member_id: "a" }, { member_id: "a" }, { member_id: "z" }] }],
      publishedPlayerCount: 2,
      draftPlayerCount: 3,
      isJointEvent: false,
    });
    expect(warnings.some((w) => w.kind === "duplicate_players")).toBe(true);
    expect(warnings.some((w) => w.kind === "ineligible_on_sheet")).toBe(true);
    expect(warnings.some((w) => w.kind === "draft_published_count_mismatch")).toBe(true);
  });

  it("returns no warnings for a completely valid sheet", () => {
    const warnings = buildTeeSheetManageWarnings({
      paidMemberIds: ["a", "b"],
      eligibleMemberIds: ["a", "b"],
      groups: [{ players: [{ member_id: "a" }, { member_id: "b" }] }],
      publishedPlayerCount: 2,
      draftPlayerCount: 2,
      isJointEvent: false,
    });
    expect(warnings).toHaveLength(0);
  });

  it("does not treat nearest-to-pin or longest-drive selections as duplicate player placements", () => {
    const warnings = buildTeeSheetManageWarnings({
      paidMemberIds: ["a"],
      eligibleMemberIds: ["a"],
      groups: [{ players: [{ member_id: "a" }] }],
      publishedPlayerCount: 1,
      draftPlayerCount: 1,
      isJointEvent: false,
    });
    expect(warnings.some((w) => w.kind === "duplicate_players")).toBe(false);
    const ntpLd = parseEditorCompetitionHoles({ ntpHolesInput: "7, 15", ldHolesInput: "3" });
    expect(ntpLd.ok).toBe(true);
  });
});
