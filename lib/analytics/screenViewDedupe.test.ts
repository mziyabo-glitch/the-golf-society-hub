import { describe, expect, it, beforeEach } from "vitest";
import {
  buildScreenViewDedupeKey,
  resetScreenViewFocusedSession,
  shouldEmitScreenView,
  SCREEN_VIEW_SUPPRESSION_MS,
} from "@/lib/analytics/screenViewDedupe";

describe("screenViewDedupe", () => {
  beforeEach(() => {
    resetScreenViewFocusedSession();
  });

  it("suppresses duplicate calls within the suppression window", () => {
    const key = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "home",
      route: "/(app)/(tabs)/home",
    });
    const t0 = 1_000_000;
    expect(shouldEmitScreenView(key, t0)).toBe(true);
    expect(shouldEmitScreenView(key, t0 + 100)).toBe(false);
    expect(shouldEmitScreenView(key, t0 + SCREEN_VIEW_SUPPRESSION_MS - 1)).toBe(false);
  });

  it("allows a new event after route changes", () => {
    const t0 = 2_000_000;
    const homeKey = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "events",
      route: "/(app)/(tabs)/events",
    });
    const teeKey = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "tee-sheet",
      route: "/(app)/tee-sheet?eventId=ev-1",
    });
    expect(shouldEmitScreenView(homeKey, t0)).toBe(true);
    expect(shouldEmitScreenView(teeKey, t0 + 50)).toBe(true);
  });

  it("allows a new event for different event IDs on the same screen", () => {
    const t0 = 3_000_000;
    const ev1 = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "tee-sheet",
      route: "/(app)/tee-sheet?eventId=ev-1",
    });
    const ev2 = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "tee-sheet",
      route: "/(app)/tee-sheet?eventId=ev-2",
    });
    expect(shouldEmitScreenView(ev1, t0)).toBe(true);
    expect(shouldEmitScreenView(ev2, t0 + 10)).toBe(true);
  });

  it("allows reopening after the suppression window", () => {
    const key = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "events",
      route: "/(app)/(tabs)/events",
    });
    const t0 = 4_000_000;
    expect(shouldEmitScreenView(key, t0)).toBe(true);
    expect(shouldEmitScreenView(key, t0 + 500)).toBe(false);
    expect(shouldEmitScreenView(key, t0 + SCREEN_VIEW_SUPPRESSION_MS + 1)).toBe(true);
  });

  it("tracks different signed-in users independently", () => {
    const t0 = 5_000_000;
    const userA = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "home",
      route: "/(app)/(tabs)/home",
    });
    const userB = buildScreenViewDedupeKey({
      userId: "user-b",
      screen: "home",
      route: "/(app)/(tabs)/home",
    });
    expect(shouldEmitScreenView(userA, t0)).toBe(true);
    expect(shouldEmitScreenView(userB, t0 + 10)).toBe(true);
    expect(shouldEmitScreenView(userA, t0 + 20)).toBe(false);
  });

  it("treats a new focused session as a fresh dedupe scope", () => {
    const t0 = 6_000_000;
    const session1 = "session-one";
    const key1 = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "home",
      route: "/(app)/(tabs)/home",
      sessionId: session1,
    });
    expect(shouldEmitScreenView(key1, t0)).toBe(true);

    resetScreenViewFocusedSession();
    const key2 = buildScreenViewDedupeKey({
      userId: "user-a",
      screen: "home",
      route: "/(app)/(tabs)/home",
    });
    expect(shouldEmitScreenView(key2, t0 + 100)).toBe(true);
  });
});
