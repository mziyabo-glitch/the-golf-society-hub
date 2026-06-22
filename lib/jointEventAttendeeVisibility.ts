/**
 * Joint vs standard event attendee visibility — society scoping + merged resolver.
 */

import {
  resolveJointEventAttendees,
  summarizeJointEventAttendees,
  type JointEventAttendeeRow,
  type JointEventGuestInput,
  type JointEventRegistrationRow,
} from "@/lib/jointEventSignups";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

export type ResolveEventAttendeesOpts = {
  isJoint: boolean;
  regs: EventRegistration[] | JointEventRegistrationRow[];
  guests: JointEventGuestInput[];
  activeSocietyId: string;
  participantSocietyIds: string[];
  societyIdToName: Map<string, string>;
  membersById?: Map<string, MemberDoc>;
  /** When true, only status "in" member registrations are included (default). */
  attendingMembersOnly?: boolean;
};

function filterRegsToParticipantSocieties(
  regs: EventRegistration[],
  participantSocietyIds: string[],
): EventRegistration[] {
  const set = new Set(participantSocietyIds.filter(Boolean));
  if (set.size === 0) return [];
  return regs.filter((r) => set.has(r.society_id));
}

function filterRegsToActiveSociety(
  regs: EventRegistration[],
  activeSocietyId: string,
): EventRegistration[] {
  return regs.filter((r) => r.society_id === activeSocietyId);
}

/**
 * Joint events: merged cross-society attendee list for both participating societies.
 * Standard events: only the active society's members and guests.
 */
export function resolveEventAttendeesForDisplay(
  opts: ResolveEventAttendeesOpts,
): JointEventAttendeeRow[] {
  const participantSet = new Set(opts.participantSocietyIds.filter(Boolean));
  const isJoint = opts.isJoint && participantSet.size >= 2;

  let scopedRegs: EventRegistration[];
  let scopedGuests: JointEventGuestInput[];

  if (isJoint) {
    scopedRegs = filterRegsToParticipantSocieties(
      opts.regs as EventRegistration[],
      opts.participantSocietyIds,
    );
    scopedGuests = opts.guests.filter((g) => participantSet.has(String(g.society_id)));
  } else {
    scopedRegs = filterRegsToActiveSociety(opts.regs as EventRegistration[], opts.activeSocietyId);
    scopedGuests = opts.guests.filter((g) => String(g.society_id) === String(opts.activeSocietyId));
  }

  return resolveJointEventAttendees(
    scopedRegs,
    scopedGuests,
    opts.societyIdToName,
    opts.membersById,
    { attendingMembersOnly: opts.attendingMembersOnly },
  );
}

export { summarizeJointEventAttendees, type JointEventAttendeeRow };
