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
  return (data ?? []) as EventRegistration[];
}

/**
 * Filter registration rows for attendance/tee UI so we never mix unrelated societies.
 *
 * - **standard**: only rows whose `society_id` is the event host (`event.society_id`).
 * - **joint_participants**: only rows for societies in the joint event (union of participants).
 * - **joint_home**: dashboard / per-society context — only the active society's rows.
 */
export function scopeEventRegistrations(
  regs: EventRegistration[],
  opts:
    | { kind: "standard"; hostSocietyId: string | null }
    | { kind: "joint_participants"; participantSocietyIds: string[] }
    | { kind: "joint_home"; activeSocietyId: string },
): EventRegistration[] {
  if (opts.kind === "standard") {
    if (!opts.hostSocietyId) return regs;
    return regs.filter((r) => r.society_id === opts.hostSocietyId);
  }
  if (opts.kind === "joint_home") {
    return regs.filter((r) => r.society_id === opts.activeSocietyId);
  }
  const set = new Set(opts.participantSocietyIds.filter(Boolean));
  if (set.size === 0) return [];
  return regs.filter((r) => set.has(r.society_id));
}

/**
 * Event detail (society tab): fee/RSVP rows for `activeSocietyId` whose `member_id` is in the
 * member list from `getMembersBySocietyId(activeSocietyId)`. Prevents cross-society rows without
 * duplicating joint/eligibility logic elsewhere.
 *
 * Tee sheets / publish flow use `isTeeSheetEligible` (confirmed + paid) in `teeSheetEligibility.ts` — different predicate.
 */
export function filterRegistrationsForActiveSocietyMembers(
  regs: EventRegistration[],
  activeSocietyId: string,
  activeMemberIds: Set<string>,
): EventRegistration[] {
  return regs.filter(
    (r) => r.society_id === activeSocietyId && activeMemberIds.has(String(r.member_id)),
  );
}

/** Confirmed / attending */
export function isRegistrationConfirmed(r: EventRegistration): boolean {
  return r.status === "in";
}

/**
 * Tee sheet generation (pairings / published tee sheet) — only these members are included.
 * Requires both confirmed attendance and payment recorded (paid ⇒ confirmed is enforced server-side).
 */
export function isTeeSheetEligible(r: EventRegistration): boolean {
  return r.status === "in" && r.paid === true;
}

/** Standard event summaries (joint attendance uses event entries, not this). */
export function summarizeEventRegistrations(regs: EventRegistration[]) {
  const attending = regs.filter(isRegistrationConfirmed);
  return {
    /** status === "in" */
    attendingCount: attending.length,
    /** Rows with paid === true (after server rule, these are also "in") */
    paidCount: regs.filter((r) => r.paid).length,
    /** Confirmed but not yet paid */
    outstandingCount: attending.filter((r) => !r.paid).length,
    /** Of those attending, how many are paid (for “X of Y paid”) */
    paidAmongAttendingCount: attending.filter((r) => r.paid).length,
    /** Confirmed + paid — only these names appear on generated / saved tee sheets */
    teeSheetEligibleCount: regs.filter(isTeeSheetEligible).length,
  };
}

/**
 * Upsert the current member's attendance status ('in' or 'out').
 * Uses the (event_id, member_id) unique constraint for idempotency.
 * Only sends {status} — payment columns are untouched (RLS safe).
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
