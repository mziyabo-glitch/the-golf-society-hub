import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventResultDoc } from "@/lib/db_supabase/resultsRepo";
import { formatPoints, formatShortDate } from "./homeFormatters";

type DashboardColors = ReturnType<typeof import("@/lib/ui/theme").getColors>;

export type RecentActivityRowVm = {
  eventId: string;
  name: string;
  dateShort: string;
  statusText: string;
  statusColor: string;
};

export function buildRecentActivityRows(
  recentEvents: EventDoc[],
  recentResultsMap: Record<string, EventResultDoc[]>,
  memberId: string | undefined,
  colors: DashboardColors,
): RecentActivityRowVm[] {
  return recentEvents.map((event) => {
    const results = recentResultsMap[event.id] ?? [];
    const hasResults = results.length > 0;
    const myResult = hasResults ? results.find((r) => r.member_id === memberId) : null;

    let statusText = "Results pending";
    let statusColor: string = colors.textTertiary;
    if (hasResults && event.isOOM && myResult) {
      const pts = Number(myResult.points) || 0;
      statusText = `${formatPoints(pts)} Order of Merit pts`;
      statusColor = colors.primary;
    } else if (hasResults && event.isOOM && !myResult) {
      statusText = "No Order of Merit points";
      statusColor = colors.textSecondary;
    } else if (hasResults && !event.isOOM) {
      statusText = "Results available";
      statusColor = colors.success;
    }

    const dateRaw = typeof event.date === "string" ? event.date : undefined;
    return {
      eventId: event.id,
      name: String(event.name ?? "Event"),
      dateShort: formatShortDate(dateRaw),
      statusText,
      statusColor,
    };
  });
}
