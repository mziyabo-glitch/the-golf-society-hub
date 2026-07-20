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

export async function fetchAdminProductEventsSummary(days: number): Promise<AnalyticsSummary> {
  const { data, error } = await supabase.rpc("admin_product_events_summary", { p_days: days });
  if (error) throw error;
  return data as AnalyticsSummary;
}
