// lib/db_supabase/eventRegistrationRepo.ts
// MVP data layer for event_registrations (attendance + payment).
//
// Business rules (simplified):
// - `paid`: fee recorded — RPC `mark_event_paid` sets status to "in" when paid (paid ⇒ confirmed).
// - `status`: "in" = attending, "out" = not playing / withdrawn.
// - Tee sheet / ManCo: only rows with status "in" AND paid (see `isTeeSheetEligible`).
// - Society-scoped UI: `filterRegistrationsForActiveSocietyMembers` + `partitionSocietyRegistrations` (eventPlayerStatus).
//
// Joint: per-society rows in `event_registrations`; shared tee/entries use joint repos elsewhere.

import { supabase } from "@/lib/supabase";

/** Cache or legacy callers may pass a non-array; never throw on `.filter`. */
function ensureRegistrationArray(regs: unknown): EventRegistration[] {
  return Array.isArray(regs) ? (regs as EventRegistration[]) : [];
}

export type EventRegistration = {
  id: string;
  society_id: string;
  event_id: string;
  member_id: string;
  /** Confirmed / attending when "in". */
  status: "in" | "out";
  paid: boolean;
  amount_paid_pence: number;
  paid_at: string | null;
  marked_by_member_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch the current user's registration for a single event.
 * Returns null when no row exists (treat as "not registered / unpaid").
 */
export async function getMyRegistration(
  eventId: string,
  memberId: string,
): Promise<EventRegistration | null> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("*")
    .eq("event_id", eventId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) {
    console.error("[eventRegRepo] getMyRegistration:", error.message);
    return null;
  }
  return data as EventRegistration | null;
}

/**
 * Fetch all registrations for a given event (visible to all society members via RLS).
 */
export async function getEventRegistrations(
  eventId: string,
): Promise<EventRegistration[]> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[eventRegRepo] getEventRegistrations:", error.message);
    return [];
  }
  return ensureRegistrationArray(data ?? []);
}

/**
 * Filter registration rows for attendance/tee UI so we never mix unrelated societies.
 *
 * - **standard**: only rows whose `society_id` is the event host (`event.society_id`).
 * - **joint_participants**: only rows for societies in the joint event (union of participants).
 * - **joint_home**: dashboard / per-society context — only the active society's rows.
 */
export function scopeEventRegistrations(
  regs: EventRegistration[] | unknown,
  opts:
    | { kind: "standard"; hostSocietyId: string | null }
    | { kind: "joint_participants"; participantSocietyIds: string[] }
    | { kind: "joint_home"; activeSocietyId: string },
): EventRegistration[] {
  const list = ensureRegistrationArray(regs);
  if (opts.kind === "standard") {
    if (!opts.hostSocietyId) return list;
    return list.filter((r) => r.society_id === opts.hostSocietyId);
  }
  if (opts.kind === "joint_home") {
    return list.filter((r) => r.society_id === opts.activeSocietyId);
  }
  const set = new Set(opts.participantSocietyIds.filter(Boolean));
  if (set.size === 0) return [];
  return list.filter((r) => set.has(r.society_id));
}

/**
 * Event detail (society tab): fee/RSVP rows for `activeSocietyId` whose `member_id` is in the
 * member list from `getMembersBySocietyId(activeSocietyId)`. Prevents cross-society rows without
 * duplicating joint/eligibility logic elsewhere.
 *
 * Tee sheets / publish flow use `isTeeSheetEligible` (confirmed + paid) in `teeSheetEligibility.ts` — different predicate.
 */
export function filterRegistrationsForActiveSocietyMembers(
  regs: EventRegistration[] | unknown,
  activeSocietyId: string,
  activeMemberIds: Set<string>,
): EventRegistration[] {
  const list = ensureRegistrationArray(regs);
  return list.filter(
    (r) => r.society_id === activeSocietyId && activeMemberIds.has(String(r.member_id)),
  );
}

/** Confirmed / attending */
export function isRegistrationConfirmed(r: EventRegistration): boolean {
  return r.status === "in";
}

/**
 * Member ids eligible for tee sheet / ManCo start flow: **status in AND paid** (see `isTeeSheetEligible`).
 * Does not require `user_id` — placeholder members count when paid.
 */
export async function getTeeSheetEligibleMemberIdsForEvent(
  eventId: string,
): Promise<string[]> {
  const regs = await getEventRegistrations(eventId);
  const ids = regs
    .filter(isTeeSheetEligible)
    .map((r) => String(r.member_id))
    .filter(Boolean);
  return [...new Set(ids)];
}

/**
 * @deprecated Use {@link getTeeSheetEligibleMemberIdsForEvent}. Historically misnamed: tee sheets
 * require confirmed **and** paid, not merely status "in".
 */
export async function getConfirmedPlayersForEvent(eventId: string): Promise<string[]> {
  return getTeeSheetEligibleMemberIdsForEvent(eventId);
}

export const JOINT_TEE_SHEET_CANDIDATE_STATUSES = ["in", "maybe", "pending"] as const;

/**
 * Joint tee-sheet candidate pool:
 * - scoped to participating societies
 * - paid only
 * - RSVP status in JOINT_TEE_SHEET_CANDIDATE_STATUSES
 */
export async function getJointTeeSheetCandidatePoolForEvent(
  eventId: string,
  participantSocietyIds: string[],
): Promise<{
  memberIds: string[];
  registrations: EventRegistration[];
  supportedStatuses: readonly string[];
}> {
  const regs = await getEventRegistrations(eventId);
  const scoped = scopeEventRegistrations(regs, {
    kind: "joint_participants",
    participantSocietyIds,
  });
  const allowed = new Set<string>(JOINT_TEE_SHEET_CANDIDATE_STATUSES);
  const filtered = scoped.filter((r) => r.paid === true && allowed.has(String(r.status)));
  const memberIds = [...new Set(filtered.map((r) => String(r.member_id)).filter(Boolean))];
  return {
    memberIds,
    registrations: filtered,
    supportedStatuses: JOINT_TEE_SHEET_CANDIDATE_STATUSES,
  };
}

/**
 * Tee sheet generation (pairings / published tee sheet) — only these members are included.
 * Requires both confirmed attendance and payment recorded (paid ⇒ confirmed is enforced server-side).
 */
export function isTeeSheetEligible(r: EventRegistration): boolean {
  return r.status === "in" && r.paid === true;
}

/** Standard event summaries (joint attendance uses event entries, not this). */
export function summarizeEventRegistrations(regs: EventRegistration[] | unknown) {
  const list = ensureRegistrationArray(regs);
  const attending = list.filter(isRegistrationConfirmed);
  return {
    /** status === "in" */
    attendingCount: attending.length,
    /** Rows with paid === true (after server rule, these are also "in") */
    paidCount: list.filter((r) => r.paid).length,
    /** Confirmed but not yet paid */
    outstandingCount: attending.filter((r) => !r.paid).length,
    /** Of those attending, how many are paid (for “X of Y paid”) */
    paidAmongAttendingCount: attending.filter((r) => r.paid).length,
    /** Confirmed + paid — only these names appear on generated / saved tee sheets */
    teeSheetEligibleCount: list.filter(isTeeSheetEligible).length,
  };
}

/**
 * Upsert the current member's attendance status ('in' or 'out').
 * Uses the (event_id, member_id) unique constraint for idempotency.
 * Only sends {status} — payment columns are untouched (RLS safe).
 *
 * Server enforcement: `event_registrations` RLS requires a `members` row with
 * `user_id = auth.uid()` for the same `member_id` / `society_id` (see migration 041).
 * Unlinked roster placeholders cannot satisfy this and therefore cannot write.
 */
export async function setMyStatus(opts: {
  eventId: string;
  societyId: string;
  memberId: string;
  status: "in" | "out";
}): Promise<EventRegistration | null> {
  const { data, error } = await supabase
    .from("event_registrations")
    .upsert(
      {
        event_id: opts.eventId,
        society_id: opts.societyId,
        member_id: opts.memberId,
        status: opts.status,
      },
      { onConflict: "event_id,member_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("[eventRegRepo] setMyStatus:", error.message);
    throw new Error(error.message || "Failed to update registration");
  }
  return data as EventRegistration;
}

/**
 * Captain/Treasurer marks a member paid/unpaid via the server-side RPC.
 * Normal members must never call this — the RPC will reject them.
 * When marking paid, the RPC sets status to "in" (paid implies confirmed).
 *
 * Creates `event_registrations` when missing (INSERT … ON CONFLICT), e.g. player is
 * only on the playing list with no RSVP row — admin can still record payment.
 */
/**
 * Captain/Treasurer marks a member paid/unpaid. `societyId` must be the **active society**
 * (same as registration.society_id for that member). Server enforces role + same-society target.
 */
export async function markMePaid(
  eventId: string,
  memberId: string,
  paid: boolean,
  societyId: string,
): Promise<void> {
  const { error } = await supabase.rpc("mark_event_paid", {
    p_event_id: eventId,
    p_society_id: societyId,
    p_target_member_id: memberId,
    p_paid: paid,
    p_amount_pence: 0,
  });

  if (error) {
    console.error("[eventRegRepo] markMePaid RPC:", error.message);
    const msg = error.message || "";
    if (msg.includes("person_id")) {
      throw new Error(
        "Database function is out of date: apply migration 073_fix_mark_event_paid_remove_person_id.sql to Supabase (SQL Editor or supabase db push), then retry.",
      );
    }
    if (
      msg.includes("Target member not found") ||
      msg.includes("Member not found for this society")
    ) {
      throw new Error(
        "Could not record payment for this member. Ensure the player belongs to your active society, or apply the latest mark_event_paid migration (see supabase/README_MARK_EVENT_PAID.md).",
      );
    }
    if (msg.includes("function public.mark_event_paid") && msg.includes("does not exist")) {
      throw new Error(
        "Database is out of date: apply migration 076_mark_event_paid_scope_society.sql (see supabase/README_MARK_EVENT_PAID.md), then retry.",
      );
    }
    throw new Error(msg || "Failed to update payment status");
  }
}

/**
 * Captain/Treasurer/Secretary/Handicapper: ensure an `event_registrations` row for a society member
 * (including placeholders with no app user). Sets status to `"in"`; does not clear payment on upsert.
 */
export async function addMemberToEventAsAdmin(opts: {
  eventId: string;
  societyId: string;
  targetMemberId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("admin_add_member_to_event", {
    p_event_id: opts.eventId,
    p_society_id: opts.societyId,
    p_target_member_id: opts.targetMemberId,
  });

  if (error) {
    console.error("[eventRegRepo] admin_add_member_to_event RPC:", error.message);
    const msg = error.message || "";
    if (msg.includes("function public.admin_add_member_to_event") && msg.includes("does not exist")) {
      throw new Error(
        "Database is out of date: apply migration 079_admin_add_member_to_event_and_manco_mark_paid.sql, then retry.",
      );
    }
    throw new Error(msg || "Failed to add member to event");
  }
}
