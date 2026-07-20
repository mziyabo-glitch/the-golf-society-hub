import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/db_supabase/productEventsRepo", () => ({
  insertProductEvent: vi.fn(() => Promise.resolve()),
}));

import { insertProductEvent } from "@/lib/db_supabase/productEventsRepo";
import { setAnalyticsContext, trackEvent } from "@/lib/analytics/trackEvent";
import { sanitizeAnalyticsMetadata } from "@/lib/analytics/sanitizeMetadata";
import { shouldShowBirdiesLeagueHomeCard, isLiveGrossScoringEnabledForEvent } from "@/lib/featureVisibility";
import { buildTeeSheetManageWarnings } from "@/lib/teeSheet/teeSheetManageWarnings";

beforeEach(() => {
  vi.mocked(insertProductEvent).mockClear();
  setAnalyticsContext({ userId: "user-1", societyId: "soc-1", userRole: "captain" });
});

describe("trackEvent", () => {
  it("does not insert when user is not authenticated", () => {
    setAnalyticsContext({ userId: null });
    trackEvent({ eventName: "screen_view", screen: "home" });
    expect(insertProductEvent).not.toHaveBeenCalled();
  });

  it("fire-and-forgets without throwing on insert failure", async () => {
    setAnalyticsContext({ userId: "user-1" });
    vi.mocked(insertProductEvent).mockRejectedValueOnce(new Error("network"));
    expect(() => trackEvent({ eventName: "tee_sheet_saved", relatedEventId: "ev-1" })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it("strips blocked metadata keys", async () => {
    setAnalyticsContext({ userId: "user-1" });
    trackEvent({
      eventName: "feature_tapped",
      feature: "export_attendees",
      metadata: { email: "secret@example.com", count: 3 },
    });
    expect(insertProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { count: 3 },
      }),
    );
  });
});

describe("sanitizeAnalyticsMetadata", () => {
  it("removes PII keys", () => {
    expect(sanitizeAnalyticsMetadata({ name: "Bob", event_id: "x" })).toEqual({ event_id: "x" });
  });
});

describe("featureVisibility", () => {
  it("hides birdies card without league or data", () => {
    expect(shouldShowBirdiesLeagueHomeCard(null, false)).toBe(false);
    expect(shouldShowBirdiesLeagueHomeCard({ id: "l1" } as any, false)).toBe(false);
    expect(shouldShowBirdiesLeagueHomeCard({ id: "l1" } as any, true)).toBe(true);
  });

  it("gates gross scoring on event flag", () => {
    expect(isLiveGrossScoringEnabledForEvent({ live_gross_scoring_enabled: false })).toBe(false);
    expect(isLiveGrossScoringEnabledForEvent({ live_gross_scoring_enabled: true })).toBe(true);
  });
});

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
    expect(warnings[0]?.message).toMatch(/3 player/);
    expect(warnings[0]?.missingPaidMemberIds).toEqual(["b", "c"]);
  });

  it("detects duplicate players and draft/published mismatch", () => {
    const warnings = buildTeeSheetManageWarnings({
      paidMemberIds: ["a"],
      eligibleMemberIds: ["a"],
      groups: [{ players: [{ member_id: "a" }, { member_id: "a" }] }],
      publishedPlayerCount: 1,
      draftPlayerCount: 2,
      isJointEvent: false,
    });
    expect(warnings.some((w) => w.kind === "duplicate_players")).toBe(true);
    expect(warnings.some((w) => w.kind === "draft_published_count_mismatch")).toBe(true);
  });
});
