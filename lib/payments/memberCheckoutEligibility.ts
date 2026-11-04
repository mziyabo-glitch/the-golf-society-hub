/**
 * Who may start a member Checkout.
 *
 * Matches the attendance rules in `lib/eventPlayerStatus.ts` and
 * `lib/db_supabase/eventRegistrationRepo.ts`:
 * - operational registration with status "in" (not removed, not withdrawn)
 * - legacy playing list: `events.player_ids` with no fee row
 *   (`lineupMemberIdsPendingFee`)
 * - joint roster: `event_entries` status confirmed or pending, with no fee row
 *
 * Paying must not create a new attendee. RSVP deadline and field capacity
 * apply only to someone who is not already on that list.
 */

export type MemberCheckoutRegistration = {
  status: string;
  removed_from_event_at?: string | null;
};

export type MemberCheckoutDecision =
  | { ok: true; via: "confirmed" | "legacy_roster" }
  | { ok: false; status: 400; error: string };

function isRemoved(value: string | null | undefined): boolean {
  return value != null && String(value).trim() !== "";
}

function onLegacyPlayingList(memberId: string, playerIds: readonly string[] | null | undefined): boolean {
  const id = String(memberId);
  return (playerIds ?? []).some((raw) => String(raw) === id);
}

/** Joint `event_entries.status` values that still mean the player is on the roster. */
function isActiveEventEntry(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  return value === "confirmed" || value === "pending";
}

export function assessMemberCheckoutEligibility(input: {
  memberId: string;
  registration: MemberCheckoutRegistration | null;
  playerIds?: readonly string[] | null;
  eventEntryStatus?: string | null;
  rsvpDeadlineAt?: string | null;
  now?: Date;
  attendingCount?: number | null;
  maxAttendees?: number | null;
}): MemberCheckoutDecision {
  const registration = input.registration;
  if (registration && (isRemoved(registration.removed_from_event_at) || registration.status !== "in")) {
    return { ok: false, status: 400, error: "RSVP as playing before paying" };
  }
  if (registration && registration.status === "in") {
    return { ok: true, via: "confirmed" };
  }

  const legacy =
    onLegacyPlayingList(input.memberId, input.playerIds) || isActiveEventEntry(input.eventEntryStatus);
  if (legacy) return { ok: true, via: "legacy_roster" };

  if (input.rsvpDeadlineAt) {
    const deadline = new Date(input.rsvpDeadlineAt);
    const now = input.now ?? new Date();
    if (!Number.isNaN(deadline.getTime()) && now.getTime() > deadline.getTime()) {
      return { ok: false, status: 400, error: "RSVP is closed" };
    }
  }

  if (
    input.maxAttendees != null &&
    input.maxAttendees >= 0 &&
    input.attendingCount != null &&
    input.attendingCount >= input.maxAttendees
  ) {
    return { ok: false, status: 400, error: "This event is full" };
  }

  return { ok: false, status: 400, error: "RSVP as playing before paying" };
}
