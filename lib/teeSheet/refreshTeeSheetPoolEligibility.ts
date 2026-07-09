import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  getEventRegistrations,
  getJointEventRegistrations,
  getJointTeeSheetCandidatePoolForEvent,
  getTeeSheetEligibleMemberIdsForEvent,
} from "@/lib/db_supabase/eventRegistrationRepo";
import { getEventGuests, getTeeSheetEligibleGuestsForEvent, type EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import { buildSocietyIdToNameMap } from "@/lib/jointEventSocietyLabel";
import { hydrateJointTeeSheetMemberPool } from "@/lib/teeSheet/hydrateJointTeeSheetMemberPool";
import { getMembersByIds, getJointEventMemberVisibility, type MemberDoc } from "@/lib/db_supabase/memberRepo";

export type TeeSheetPoolEligibilitySnapshot = {
  registrations: EventRegistration[];
  eligibleMemberIds: string[];
  paidGuests: EventGuest[];
  allGuests: EventGuest[];
  eventMemberPool?: MemberDoc[];
};

/** Refresh paid / confirmed pool metadata without reloading persisted tee groups. */
export async function loadTeeSheetPoolEligibilityForEvent(
  eventId: string,
  opts?: {
    isJoint?: boolean;
    participantSocietyIds?: string[];
    participatingSocieties?: { society_id: string; society_name: string }[];
  },
): Promise<TeeSheetPoolEligibilitySnapshot> {
  if (opts?.isJoint && (opts.participantSocietyIds?.length ?? 0) >= 2) {
    const participantSocietyIds = opts.participantSocietyIds ?? [];
    const societyIdToName = buildSocietyIdToNameMap(
      (opts.participatingSocieties ?? []).map((s) => ({
        society_id: s.society_id,
        society_name: s.society_name,
      })),
    );
    const [regs, allGuests, pooled] = await Promise.all([
      getJointEventRegistrations(eventId),
      getEventGuests(eventId),
      getJointEventMemberVisibility(eventId).catch(() => [] as MemberDoc[]),
    ]);
    const candidate = await getJointTeeSheetCandidatePoolForEvent(eventId, participantSocietyIds, {
      societyIdToName,
      participatingMembers: pooled,
      guests: allGuests,
      registrations: regs,
    });
    const candidateMembers = await hydrateJointTeeSheetMemberPool({
      candidateMemberIds: candidate.memberIds,
      pooledMembers: pooled,
      registrations: regs,
      fetchMembersByIds: getMembersByIds,
    });
    const eligibleGuestIdSet = new Set(
      candidate.guestPlayerIds
        .map((pid) => (pid.startsWith("guest-") ? pid.slice("guest-".length) : ""))
        .filter(Boolean),
    );
    return {
      registrations: regs,
      eligibleMemberIds: candidate.memberIds,
      paidGuests: allGuests.filter((g) => eligibleGuestIdSet.has(g.id)),
      allGuests,
      eventMemberPool: candidateMembers,
    };
  }

  const [registrations, eligibleMemberIds, paidGuests, allGuests] = await Promise.all([
    getEventRegistrations(eventId),
    getTeeSheetEligibleMemberIdsForEvent(eventId),
    getTeeSheetEligibleGuestsForEvent(eventId),
    getEventGuests(eventId),
  ]);

  return {
    registrations,
    eligibleMemberIds,
    paidGuests,
    allGuests,
  };
}
