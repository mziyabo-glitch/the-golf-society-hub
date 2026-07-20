import { Platform } from "react-native";

import { insertProductEvent } from "@/lib/db_supabase/productEventsRepo";
import { sanitizeAnalyticsMetadata } from "@/lib/analytics/sanitizeMetadata";
import type { AnalyticsContext, ProductEventName, TrackEventInput } from "@/lib/analytics/types";

let analyticsContext: AnalyticsContext = {
  platform: Platform.OS,
};

export function setAnalyticsContext(partial: Partial<AnalyticsContext>): void {
  analyticsContext = { ...analyticsContext, ...partial };
}

export function getAnalyticsContext(): AnalyticsContext {
  return analyticsContext;
}

/**
 * Fire-and-forget product analytics. Never throws to callers; never blocks UI.
 */
export function trackEvent(input: TrackEventInput): void {
  const ctx = getAnalyticsContext();
  const userId = ctx.userId ?? null;
  if (!userId) return;

  const payload = {
    event_name: input.eventName,
    user_id: userId,
    society_id: input.societyId ?? ctx.societyId ?? null,
    screen: input.screen ?? null,
    feature: input.feature ?? null,
    related_event_id: input.relatedEventId ?? null,
    user_role: input.userRole ?? ctx.userRole ?? null,
    platform: input.platform ?? ctx.platform ?? Platform.OS,
    metadata: sanitizeAnalyticsMetadata(input.metadata ?? {}),
  };

  void insertProductEvent(payload).catch((err) => {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[analytics] insert failed", input.eventName, err);
    }
  });
}

export function trackFeatureTapped(
  feature: string,
  opts?: { screen?: string; societyId?: string; relatedEventId?: string; metadata?: Record<string, unknown> },
): void {
  trackEvent({
    eventName: "feature_tapped",
    feature,
    screen: opts?.screen,
    societyId: opts?.societyId,
    relatedEventId: opts?.relatedEventId,
    metadata: opts?.metadata,
  });
}

export function trackErrorShown(
  screen: string,
  opts?: { messageCode?: string; societyId?: string; relatedEventId?: string },
): void {
  trackEvent({
    eventName: "error_shown",
    screen,
    societyId: opts?.societyId,
    relatedEventId: opts?.relatedEventId,
    metadata: opts?.messageCode ? { message_code: opts.messageCode } : {},
  });
}

export function trackExportCompleted(
  exportType: string,
  opts?: {
    screen?: string;
    societyId?: string;
    relatedEventId?: string;
    format?: string;
    feature?: string;
  },
): void {
  const feature = opts?.feature ?? exportType;
  trackEvent({
    eventName: "export_completed",
    screen: opts?.screen,
    feature,
    societyId: opts?.societyId,
    relatedEventId: opts?.relatedEventId,
    metadata: {
      export_type: exportType,
      event_id: opts?.relatedEventId ?? null,
      society_id: opts?.societyId ?? null,
      feature,
      ...(opts?.format ? { format: opts.format } : {}),
    },
  });
}

export function isProductEventName(value: string): value is ProductEventName {
  return (
    value === "screen_view" ||
    value === "event_rsvp_submitted" ||
    value === "payment_marked" ||
    value === "tee_sheet_opened" ||
    value === "tee_sheet_saved" ||
    value === "tee_sheet_published" ||
    value === "oom_results_saved" ||
    value === "export_completed" ||
    value === "feature_tapped" ||
    value === "error_shown"
  );
}
