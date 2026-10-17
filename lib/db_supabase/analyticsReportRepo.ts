import { supabase } from "@/lib/supabase";

export type AnalyticsEventNameRow = {
  event_name: string;
  count: number;
  unique_users: number;
  last_at: string | null;
};

export type AnalyticsErrorScreenRow = {
  screen: string;
  count: number;
  last_at: string | null;
};

export type AnalyticsSummary = {
  since: string;
  days: number;
  totals: { events: number; unique_users: number };
  by_event_name: AnalyticsEventNameRow[];
  errors_by_screen: AnalyticsErrorScreenRow[];
  exports: { count: number; unique_users: number; last_at: string | null };
  tee_sheet: {
    opened: number;
    saved: number;
    published: number;
    last_saved_at: string | null;
    last_published_at: string | null;
  };
  rsvp_payment: { rsvp_submitted: number; payment_marked: number };
};

const SCREEN_VIEW_EVENTS = new Set(["screen_view"]);
const ERROR_EVENTS = new Set(["error_shown"]);
const ACTION_EVENTS = new Set([
  "event_rsvp_submitted",
  "payment_marked",
  "tee_sheet_opened",
  "tee_sheet_saved",
  "tee_sheet_published",
  "oom_results_saved",
  "export_completed",
  "feature_tapped",
]);

export function classifyAnalyticsEventName(eventName: string): "screen_view" | "action" | "error" | "other" {
  if (SCREEN_VIEW_EVENTS.has(eventName)) return "screen_view";
  if (ERROR_EVENTS.has(eventName)) return "error";
  if (ACTION_EVENTS.has(eventName)) return "action";
  return "other";
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Normalize RPC jsonb into a stable UI shape (empty aggregates never crash the screen). */
export function normalizeAnalyticsSummary(raw: unknown, fallbackDays: number): AnalyticsSummary {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const totals = data.totals && typeof data.totals === "object" ? (data.totals as Record<string, unknown>) : {};
  const exports = data.exports && typeof data.exports === "object" ? (data.exports as Record<string, unknown>) : {};
  const teeSheet =
    data.tee_sheet && typeof data.tee_sheet === "object" ? (data.tee_sheet as Record<string, unknown>) : {};
  const rsvp =
    data.rsvp_payment && typeof data.rsvp_payment === "object"
      ? (data.rsvp_payment as Record<string, unknown>)
      : {};

  return {
    since: asNullableString(data.since) ?? new Date().toISOString(),
    days: asNumber(data.days) || fallbackDays,
    totals: {
      events: asNumber(totals.events),
      unique_users: asNumber(totals.unique_users),
    },
    by_event_name: Array.isArray(data.by_event_name)
      ? (data.by_event_name as AnalyticsEventNameRow[])
      : [],
    errors_by_screen: Array.isArray(data.errors_by_screen)
      ? (data.errors_by_screen as AnalyticsErrorScreenRow[])
      : [],
    exports: {
      count: asNumber(exports.count),
      unique_users: asNumber(exports.unique_users),
      last_at: asNullableString(exports.last_at),
    },
    tee_sheet: {
      opened: asNumber(teeSheet.opened),
      saved: asNumber(teeSheet.saved),
      published: asNumber(teeSheet.published),
      last_saved_at: asNullableString(teeSheet.last_saved_at),
      last_published_at: asNullableString(teeSheet.last_published_at),
    },
    rsvp_payment: {
      rsvp_submitted: asNumber(rsvp.rsvp_submitted),
      payment_marked: asNumber(rsvp.payment_marked),
    },
  };
}

export async function fetchAdminProductEventsSummary(days: number): Promise<AnalyticsSummary> {
  const { data, error } = await supabase.rpc("admin_product_events_summary", { p_days: days });
  if (error) {
    const message = error.message || "Could not load usage report.";
    throw new Error(message);
  }
  return normalizeAnalyticsSummary(data, days);
}
