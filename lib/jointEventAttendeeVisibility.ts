/**
 * Joint vs standard event attendee visibility — society scoping + merged resolver.
 */

import {
  resolveJointEventAttendees,
  summarizeJointEventAttendees,
  isJointRegistrationTeeSheetEligible,
  type JointEventAttendeeRow,
  type JointEventGuestInput,
  type JointEventRegistrationRow,
} from "@/lib/jointEventSignups";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { PaymentShareExportRow, PaymentShareNameLists } from "@/lib/eventPaymentShare";

export type ResolveEventAttendeesOpts = {
  isJoint: boolean;
  regs: EventRegistration[] | JointEventRegistrationRow[];
  guests: JointEventGuestInput[];
  activeSocietyId: string;
  participantSocietyIds: string[];
  societyIdToName: Map<string, string>;
  membersById?: Map<string, MemberDoc>;
  /** All member rows from participating societies (for dual membership detection). */
  participatingMembers?: MemberDoc[];
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
    {
      attendingMembersOnly: opts.attendingMembersOnly,
      participatingMembers: opts.participatingMembers,
      participantSocietyIds: isJoint ? opts.participantSocietyIds : undefined,
    },
  );
}

function formatJointAttendeeShareName(row: JointEventAttendeeRow): string {
  const name = row.displayName.trim();
  const src = row.sourceLabel.trim();
  if (!src) return name;
  return `${name} (${src})`;
}

/** One export row per de-duped attendee (PDF / full-status table). */
export function buildPaymentExportRowsFromJointAttendees(
  rows: JointEventAttendeeRow[],
): PaymentShareExportRow[] {
  return rows
    .map((row) => ({
      name: row.displayName.trim(),
      typeLabel: row.sourceLabel.trim() || (row.guestId ? "Guest" : "Member"),
      statusLabel: row.paymentLabel.trim() || "Unpaid",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Paid / unpaid / full-status lists for joint events (both participating societies, de-duped).
 * Paid list: every source paid. Unpaid list: any source unpaid (mixed dual rows appear here only).
 */
export function buildPaymentShareListsFromJointAttendees(
  rows: JointEventAttendeeRow[],
): PaymentShareNameLists {
  const uniqSort = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

  const paidNames: string[] = [];
  const unpaidNames: string[] = [];
  const entries: PaymentShareNameLists["entries"] = [];

  for (const row of rows) {
    const name = formatJointAttendeeShareName(row);
    const type = row.guestId ? ("guest" as const) : ("member" as const);
    const typeLabel = row.sourceLabel.trim() || (type === "guest" ? "Guest" : "Member");
    const allPaid = row.sources.every((s) => s.paid);
    const anyUnpaid = row.sources.some((s) => !s.paid);

    if (allPaid) {
      paidNames.push(name);
      entries.push({ name, status: "paid", type, typeLabel });
    }
    if (anyUnpaid) {
      unpaidNames.push(name);
      entries.push({ name, status: "unpaid", type, typeLabel });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  return {
    paidNames: uniqSort(paidNames),
    unpaidNames: uniqSort(unpaidNames),
    entries,
    exportRows: buildPaymentExportRowsFromJointAttendees(rows),
  };
}

export type JointEventRegistrationResolution = {
  attendeeRows: JointEventAttendeeRow[];
  paymentLists: PaymentShareNameLists;
  /** De-duped member ids with status in + paid in any participating society. */
  teeSheetEligibleMemberIds: string[];
};

/** Member ids for tee sheet / PNG export — one per person, prefer paid+confirmed registration. */
export function teeSheetEligibleMemberIdsFromJointAttendees(
  rows: JointEventAttendeeRow[],
): string[] {
  const out: string[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    if (row.guestId) continue;
    const eligibleReg = row.registrations.find(isJointRegistrationTeeSheetEligible);
    if (!eligibleReg) continue;
    if (seenKeys.has(row.key)) continue;
    seenKeys.add(row.key);
    out.push(String(eligibleReg.member_id));
  }

  return out;
}

/**
 * Single resolver for joint-event paid / unpaid / full-status lists and tee-sheet eligibility.
 * Non-joint events: use society-scoped buildPaymentShareNameLists instead.
 */
export function resolveJointEventRegistrations(
  opts: ResolveEventAttendeesOpts,
): JointEventRegistrationResolution {
  const attendeeRows = resolveEventAttendeesForDisplay(opts);
  return {
    attendeeRows,
    paymentLists: buildPaymentShareListsFromJointAttendees(attendeeRows),
    teeSheetEligibleMemberIds: teeSheetEligibleMemberIdsFromJointAttendees(attendeeRows),
  };
}

export { summarizeJointEventAttendees, type JointEventAttendeeRow };
