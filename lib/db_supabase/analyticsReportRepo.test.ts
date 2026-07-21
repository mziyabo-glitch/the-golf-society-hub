import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import {
  classifyAnalyticsEventName,
  normalizeAnalyticsSummary,
} from "@/lib/db_supabase/analyticsReportRepo";

describe("normalizeAnalyticsSummary", () => {
  it("fills defaults when RPC returns sparse aggregates", () => {
    const summary = normalizeAnalyticsSummary({}, 30);
    expect(summary.days).toBe(30);
    expect(summary.totals).toEqual({ events: 0, unique_users: 0 });
    expect(summary.tee_sheet.opened).toBe(0);
    expect(summary.exports.count).toBe(0);
    expect(summary.by_event_name).toEqual([]);
  });

  it("preserves populated fields", () => {
    const summary = normalizeAnalyticsSummary(
      {
        since: "2026-07-01T00:00:00Z",
        days: 7,
        totals: { events: 3, unique_users: 1 },
        by_event_name: [{ event_name: "screen_view", count: 3, unique_users: 1, last_at: null }],
        tee_sheet: { opened: 2, saved: 1, published: 0 },
        rsvp_payment: { rsvp_submitted: 4, payment_marked: 1 },
        exports: { count: 1, unique_users: 1, last_at: "2026-07-02T00:00:00Z" },
      },
      30,
    );
    expect(summary.totals.events).toBe(3);
    expect(summary.tee_sheet).toMatchObject({ opened: 2, saved: 1, published: 0 });
    expect(summary.exports.count).toBe(1);
  });
});

describe("classifyAnalyticsEventName", () => {
  it("classifies tee sheet open as an action", () => {
    expect(classifyAnalyticsEventName("tee_sheet_opened")).toBe("action");
    expect(classifyAnalyticsEventName("screen_view")).toBe("screen_view");
  });
});
