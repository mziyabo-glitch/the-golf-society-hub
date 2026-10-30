import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  isEventPastForList,
  partitionUpcomingPast,
  sortPastMostRecentFirst,
  sortUpcomingNearestFirst,
} from "@/lib/eventListGrouping";
import { resolveHomePlayingStatus } from "@/lib/home/homeNextEventPanelModel";

export type EventsListSegment = "upcoming" | "my_events" | "past_results";

export const EVENTS_LIST_SEGMENT_LABELS: Record<EventsListSegment, string> = {
  upcoming: "Upcoming",
  my_events: "My events",
  past_results: "Past results",
};

export function indexRegistrationsByEventId(
  regs: EventRegistration[],
): Map<string, EventRegistration> {
  const map = new Map<string, EventRegistration>();
  for (const r of regs) {
    if (!r?.event_id) continue;
    map.set(String(r.event_id), r);
  }
  return map;
}

/** Member is “in” this event for list filtering. */
export function isMemberPlayingEvent(
  eventId: string,
  regByEventId: Map<string, EventRegistration>,
): boolean {
  return regByEventId.get(String(eventId))?.status === "in";
}

/** Past events suitable for the results tab (completed, dated past, or any past with a winner flagged). */
export function isPastResultsListCandidate(
  event: Pick<EventDoc, "isCompleted" | "date" | "winnerName">,
): boolean {
  if (!isEventPastForList(event)) return false;
  if (event.isCompleted || event.winnerName?.trim()) return true;
  return true;
}

export function filterEventsForSegment(
  events: EventDoc[],
  segment: EventsListSegment,
  regByEventId: Map<string, EventRegistration>,
): EventDoc[] {
  const { upcoming, past } = partitionUpcomingPast(events);

  if (segment === "upcoming") {
    return sortUpcomingNearestFirst(upcoming);
  }

  if (segment === "my_events") {
    const playingUpcoming = sortUpcomingNearestFirst(
      upcoming.filter((ev) => isMemberPlayingEvent(ev.id, regByEventId)),
    );
    const playingPast = sortPastMostRecentFirst(
      past.filter((ev) => isMemberPlayingEvent(ev.id, regByEventId)),
    );
    return [...playingUpcoming, ...playingPast];
  }

  const pastResults = past.filter((ev) => isPastResultsListCandidate(ev));
  return sortPastMostRecentFirst(pastResults);
}

export type EventListRowMeta = {
  playingLabel: string | null;
  showScheduledStatus: boolean;
  emphasizeResults: boolean;
};

/** Reduce badge noise on list cards. */
export function eventListRowMeta(
  event: EventDoc,
  reg: EventRegistration | null | undefined,
  segment: EventsListSegment,
): EventListRowMeta {
  const playing = reg ? resolveHomePlayingStatus(reg) : null;
  const playingLabel =
    playing && playing.label !== "No response" ? playing.label : segment === "my_events" ? "Playing" : null;

  const isPast = isEventPastForList(event);
  const showScheduledStatus =
    !isPast && event.status !== "cancelled" && event.status !== "in_progress" && !event.isCompleted;

  return {
    playingLabel,
    showScheduledStatus,
    emphasizeResults: segment === "past_results" || isPast,
  };
}
