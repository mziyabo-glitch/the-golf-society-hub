import { describe, expect, it } from "vitest";
import { buildTeeSheetManageWarnings } from "@/lib/teeSheet/teeSheetManageWarnings";

describe("buildTeeSheetManageWarnings", () => {
  it("warns when paid players are missing from the sheet", () => {
    const warnings = buildTeeSheetManageWarnings({
      paidMemberIds: ["a", "b", "c"],
      eligibleMemberIds: ["a", "b", "c"],
      groups: [{ players: [{ member_id: "a" }] }],
      publishedPlayerCount: 1,
      draftPlayerCount: 1,
      isJointEvent: false,
    });
    expect(warnings.some((w) => w.kind === "paid_not_on_sheet")).toBe(true);
    expect(warnings[0]?.missingPaidMemberIds).toEqual(["b", "c"]);
  });

  it("flags ineligible and duplicate players", () => {
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
});
