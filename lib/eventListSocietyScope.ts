import type { EventDoc } from "@/lib/db_supabase/eventRepo";

export function eventDateKey(date: string | undefined | null): string | null {
  if (!date) return null;
  const trimmed = String(date).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

export type ParticipantEventSuppressionInput = {
  societyId: string;
  hostEvents: readonly Pick<EventDoc, "id" | "society_id" | "date">[];
  participantEvent: Pick<EventDoc, "id" | "society_id" | "date">;
  participantSocietyIds: readonly string[];
};

/**
 * Suppress a partner-hosted joint event from a society's event list when that society
 * already hosts its own event on the same date.
 *
 * Example: ZGS hosts "OOM 10 - Super Cup" and is also a participant on M4's
 * "OOM 6 - Super Cup" joint record for the same fixture day — only the ZGS-hosted
 * card should appear on the ZGS Events page.
 */
export function shouldSuppressParticipantEventForSocietyList(
  input: ParticipantEventSuppressionInput,
): boolean {
  const { societyId, hostEvents, participantEvent, participantSocietyIds } = input;
  const sid = String(societyId);
  const hostSocietyId = String(participantEvent.society_id ?? "");

  if (hostSocietyId === sid) return false;

  if (!participantSocietyIds.some((x) => String(x) === sid)) return false;

  const participantDate = eventDateKey(participantEvent.date);
  if (!participantDate) return false;

  return hostEvents.some(
    (hostEvent) =>
      String(hostEvent.society_id) === sid && eventDateKey(hostEvent.date) === participantDate,
  );
}

export function filterParticipantEventsForSocietyList(
  societyId: string,
  hostEvents: readonly EventDoc[],
  participantEvents: readonly EventDoc[],
  participantSocietyIdsByEventId: ReadonlyMap<string, readonly string[]>,
): EventDoc[] {
  return participantEvents.filter((participantEvent) => {
    const participantSocietyIds = participantSocietyIdsByEventId.get(participantEvent.id) ?? [];
    return !shouldSuppressParticipantEventForSocietyList({
      societyId,
      hostEvents,
      participantEvent,
      participantSocietyIds,
    });
  });
}
