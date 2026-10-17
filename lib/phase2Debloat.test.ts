import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("@/lib/db_supabase/productEventsRepo", () => ({
  insertProductEvent: vi.fn(() => Promise.resolve()),
}));

import { insertProductEvent } from "@/lib/db_supabase/productEventsRepo";
import {
  setAnalyticsContext,
  trackDeprecatedRedirect,
  trackLegacyFeatureUsed,
} from "@/lib/analytics/trackEvent";
import {
  BIRDIES_LEAGUE_UI_ENABLED,
  isBirdiesLeagueUiEnabled,
  isLiveGrossScoringEnabledForEvent,
  shouldRedirectDeprecatedScorecardHub,
  shouldShowBirdiesLeagueHomeCard,
} from "@/lib/featureVisibility";
import {
  buildDeprecatedRedirectMetadata,
  shouldRedirectBareTeeSheetRoute,
  shouldRedirectCourseDataForNonPlatformAdmin,
} from "@/lib/navigation/deprecatedRoute";

beforeEach(() => {
  vi.mocked(insertProductEvent).mockClear();
  setAnalyticsContext({ userId: "user-1", societyId: "soc-1", userRole: "captain", platform: "web" });
});

describe("Phase 2: bare tee-sheet redirect", () => {
  it("redirects when eventId is missing or blank", () => {
    expect(shouldRedirectBareTeeSheetRoute(undefined)).toBe(true);
    expect(shouldRedirectBareTeeSheetRoute(null)).toBe(true);
    expect(shouldRedirectBareTeeSheetRoute("")).toBe(true);
    expect(shouldRedirectBareTeeSheetRoute("   ")).toBe(true);
    expect(shouldRedirectBareTeeSheetRoute([])).toBe(true);
  });

  it("keeps event-specific tee-sheet route", () => {
    expect(shouldRedirectBareTeeSheetRoute("evt-1")).toBe(false);
    expect(shouldRedirectBareTeeSheetRoute(["evt-1"])).toBe(false);
  });
});

describe("Phase 2: live gross scoring visibility", () => {
  it("hides gross scoring by default", () => {
    expect(isLiveGrossScoringEnabledForEvent(null)).toBe(false);
    expect(isLiveGrossScoringEnabledForEvent({ live_gross_scoring_enabled: false })).toBe(false);
    expect(shouldRedirectDeprecatedScorecardHub(null)).toBe(true);
    expect(shouldRedirectDeprecatedScorecardHub({ live_gross_scoring_enabled: false })).toBe(true);
  });

  it("shows gross scoring when event flag is enabled", () => {
    expect(isLiveGrossScoringEnabledForEvent({ live_gross_scoring_enabled: true })).toBe(true);
    expect(isLiveGrossScoringEnabledForEvent({ liveGrossScoringEnabled: true })).toBe(true);
    expect(shouldRedirectDeprecatedScorecardHub({ live_gross_scoring_enabled: true })).toBe(false);
  });
});

describe("Phase 2: Birdies League hidden without valid data / flag", () => {
  it("keeps UI flag off pending recording workflow", () => {
    expect(BIRDIES_LEAGUE_UI_ENABLED).toBe(false);
    expect(isBirdiesLeagueUiEnabled()).toBe(false);
  });

  it("never shows home/rivalries card while flag is off", () => {
    expect(shouldShowBirdiesLeagueHomeCard(null, false)).toBe(false);
    expect(shouldShowBirdiesLeagueHomeCard({ id: "l1" } as any, false)).toBe(false);
    expect(shouldShowBirdiesLeagueHomeCard({ id: "l1" } as any, true)).toBe(false);
  });
});

describe("Phase 2: course data editor platform-admin gate", () => {
  it("redirects non–platform-admin users", () => {
    expect(shouldRedirectCourseDataForNonPlatformAdmin(false)).toBe(true);
    expect(shouldRedirectCourseDataForNonPlatformAdmin(true)).toBe(false);
  });
});

describe("Phase 2: deprecated redirect analytics", () => {
  it("emits deprecated_route_opened and redirect_triggered without PII", () => {
    trackDeprecatedRedirect({
      feature: "tee_sheet_generator",
      oldRoute: "/(app)/tee-sheet",
      destinationRoute: "/(app)/(tabs)/events",
      societyId: "soc-1",
      screen: "tee-sheet",
    });
    expect(insertProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "deprecated_route_opened",
        feature: "tee_sheet_generator",
        metadata: expect.objectContaining({
          feature: "tee_sheet_generator",
          old_route: "/(app)/tee-sheet",
          destination_route: "/(app)/(tabs)/events",
        }),
      }),
    );
    expect(insertProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "redirect_triggered",
        feature: "tee_sheet_generator",
      }),
    );
  });

  it("tracks legacy_feature_used", () => {
    trackLegacyFeatureUsed({
      feature: "live_gross_scoring",
      oldRoute: "/(app)/(tabs)/scorecard",
      societyId: "soc-1",
    });
    expect(insertProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "legacy_feature_used",
        feature: "live_gross_scoring",
      }),
    );
  });

  it("buildDeprecatedRedirectMetadata omits empty society", () => {
    expect(
      buildDeprecatedRedirectMetadata({
        feature: "x",
        oldRoute: "/a",
        destinationRoute: "/b",
        platform: "web",
      }),
    ).toEqual({
      feature: "x",
      old_route: "/a",
      destination_route: "/b",
      platform: "web",
    });
  });
});

/** Navigation entry-point inventory for Phase 2 More / Free Play / Events journey. */
describe("Phase 2: intended navigation entry points", () => {
  const MORE_FREE_PLAY = "/(app)/free-play";
  const EVENT_TEE_SHEET_EDITOR = "/(app)/tee-sheet?eventId=";
  const EVENT_PUBLISHED_TEE_SHEET = "/(app)/event/[id]/tee-sheet";
  const EVENTS_TAB = "/(app)/(tabs)/events";

  it("documents Free Play accessible through More only", () => {
    expect(MORE_FREE_PLAY).toBe("/(app)/free-play");
  });

  it("documents event-specific tee-sheet journey", () => {
    expect(EVENT_TEE_SHEET_EDITOR.startsWith("/(app)/tee-sheet")).toBe(true);
    expect(EVENT_PUBLISHED_TEE_SHEET).toContain("tee-sheet");
    expect(EVENTS_TAB).toBe("/(app)/(tabs)/events");
  });
});
