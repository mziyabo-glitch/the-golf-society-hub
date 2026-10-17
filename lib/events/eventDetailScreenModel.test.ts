import {
  buildEventDetailQuickActions,
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
    expect(shouldShowMemberPaymentStatus({ status: "out", paid: false } as never, "£45")).toBe(false);
  });
});
