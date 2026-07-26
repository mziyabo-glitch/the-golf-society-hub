export const PRODUCT_EVENT_NAMES = [
  "screen_view",
  "event_rsvp_submitted",
  "payment_marked",
  "tee_sheet_opened",
  "tee_sheet_saved",
  "tee_sheet_published",
  "oom_results_saved",
  "export_completed",
  "feature_tapped",
  "error_shown",
  "deprecated_route_opened",
  "legacy_feature_used",
  "redirect_triggered",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export type TrackEventInput = {
  eventName: ProductEventName;
  screen?: string | null;
  feature?: string | null;
  societyId?: string | null;
  relatedEventId?: string | null;
  userRole?: string | null;
  platform?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AnalyticsContext = {
  userId?: string | null;
  societyId?: string | null;
  userRole?: string | null;
  platform?: string | null;
};
