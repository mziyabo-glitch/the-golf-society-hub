import { describe, expect, it } from "vitest";
import {
  buildEventDetailQuickActions,
  memberPayNowPlaying,
  shouldShowMemberPaymentStatus,
  splitQuickActionsForAudience,
} from "./eventDetailScreenModel";

describe("eventDetailScreenModel", () => {
  it("orders member tee sheet and results before admin scoring", () => {
    const actions = buildEventDetailQuickActions({
      canViewTeeSheet: true,
      hasResults: true,
      canManageHandicaps: true,
      canEnterGrossScores: true,
      canAccessScorecardUi: true,
      prizePoolEnabled: false,
    });
    const { member, admin } = splitQuickActionsForAudience(actions, true);
    expect(member.map((a) => a.id)).toEqual(["players", "tee_sheet", "results"]);
    expect(admin.map((a) => a.id)).toEqual(["scoring_leaderboard", "gross_entry", "publish_scoring"]);
  });

  it("hides admin block for members", () => {
    const actions = buildEventDetailQuickActions({
      canViewTeeSheet: false,
      hasResults: false,
      canManageHandicaps: false,
      canEnterGrossScores: false,
      canAccessScorecardUi: false,
      prizePoolEnabled: true,
    });
    const { member, admin } = splitQuickActionsForAudience(actions, false);
    expect(member.map((a) => a.id)).toEqual(["players", "prize_pool"]);
    expect(admin).toHaveLength(0);
  });

  it("shows payment row when playing and fee set", () => {
    expect(
      shouldShowMemberPaymentStatus(
        { status: "in", paid: false } as never,
        "£45",
      ),
    ).toBe(true);
    expect(
      shouldShowMemberPaymentStatus({ status: "in", paid: false } as never, null, 4500),
    ).toBe(true);
    expect(shouldShowMemberPaymentStatus({ status: "out", paid: false } as never, "£45")).toBe(false);
  });

  it("offers Pay now for a joint roster entry Checkout would accept", () => {
    const memberId = "30000000-0000-4000-8000-000000000001";
    expect(memberPayNowPlaying({
      memberId,
      registration: null,
      playerIds: [],
      eventEntryStatus: "confirmed",
    })).toBe(true);
    expect(memberPayNowPlaying({
      memberId,
      registration: null,
      playerIds: [],
      eventEntryStatus: "pending",
    })).toBe(true);
    expect(memberPayNowPlaying({
      memberId,
      registration: null,
      playerIds: [],
      eventEntryStatus: null,
    })).toBe(false);
    expect(memberPayNowPlaying({
      memberId,
      registration: null,
      playerIds: [],
      eventEntryStatus: "withdrawn",
    })).toBe(false);
    expect(memberPayNowPlaying({
      memberId,
      registration: { status: "out" },
      playerIds: [memberId],
      eventEntryStatus: "confirmed",
    })).toBe(false);
  });
});
