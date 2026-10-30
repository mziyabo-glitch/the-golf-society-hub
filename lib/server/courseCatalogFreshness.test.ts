import { describe, expect, it } from "vitest";
import { decideCatalogFullRefresh, type CourseCatalogFreshnessMetrics, type CourseCatalogFreshnessThresholds } from "./courseCatalogFreshness";

const baseThresholds = (): CourseCatalogFreshnessThresholds => ({
  staleAgeDays: 45,
  minStaleCoursesToTrigger: 8,
  minCoursesWithMissingStrokeIndexToTrigger: 5,
  minCoursesWithIncompleteTeeBlockToTrigger: 5,
  staleFractionTrigger: null,
  staleSweepMaxCourses: 25,
});

const baseMetrics = (): CourseCatalogFreshnessMetrics => ({
  evaluatedAtIso: "2026-01-01T00:00:00.000Z",
  staleAgeCutoffIso: "2025-01-01T00:00:00.000Z",
  coursesWithApiId: 100,
  staleByLastSyncedCount: 0,
  coursesWithMissingStrokeIndex: 0,
  coursesWithIncompleteTeeBlock: 0,
});

describe("decideCatalogFullRefresh", () => {
  it("does not trigger when all metrics are below thresholds", () => {
    const { triggered, reasons } = decideCatalogFullRefresh(baseMetrics(), baseThresholds(), { force: false });
    expect(triggered).toBe(false);
    expect(reasons.length).toBe(0);
  });

  it("triggers when stale-by-age count crosses threshold", () => {
    const metrics = { ...baseMetrics(), staleByLastSyncedCount: 10 };
    const { triggered, reasons } = decideCatalogFullRefresh(metrics, baseThresholds(), { force: false });
    expect(triggered).toBe(true);
    expect(reasons.some((r) => r.includes("staleByLastSyncedCount"))).toBe(true);
  });

  it("triggers when missing stroke index course estimate crosses threshold", () => {
    const metrics = { ...baseMetrics(), coursesWithMissingStrokeIndex: 6 };
    const { triggered, reasons } = decideCatalogFullRefresh(metrics, baseThresholds(), { force: false });
    expect(triggered).toBe(true);
    expect(reasons.some((r) => r.includes("coursesWithMissingStrokeIndex"))).toBe(true);
  });

  it("triggers on stale fraction when configured", () => {
    const metrics = { ...baseMetrics(), coursesWithApiId: 100, staleByLastSyncedCount: 20 };
    const thresholds = { ...baseThresholds(), staleFractionTrigger: 0.15 };
    const { triggered, reasons } = decideCatalogFullRefresh(metrics, thresholds, { force: false });
    expect(triggered).toBe(true);
    expect(reasons.some((r) => r.includes("stale fraction"))).toBe(true);
  });

  it("honours explicit force option", () => {
    const { triggered, reasons } = decideCatalogFullRefresh(baseMetrics(), baseThresholds(), { force: true });
    expect(triggered).toBe(true);
    expect(reasons[0]).toMatch(/force/i);
  });
});
