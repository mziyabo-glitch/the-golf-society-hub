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

import { type JointEventRegistrationRow } from "@/lib/jointEventSignups";
import { resolveJointEventRegistrations } from "@/lib/jointEventAttendeeVisibility";
import { getEventGuests, type EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
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
  /** ManCo soft-remove: row kept for audit, hidden from operational UIs when set. */
  removed_from_event_at?: string | null;
  removed_by_member_id?: string | null;
};

/** Registrations visible on event manage / players / payments / tee eligibility. */
export function isOperationalEventRegistration(r: EventRegistration | null | undefined): boolean {
  if (!r) return false;
  return r.removed_from_event_at == null || String(r.removed_from_event_at).trim() === "";
}

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
    .is("removed_from_event_at", null)
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
  opts?: { includeRemoved?: boolean },
): Promise<EventRegistration[]> {
  let q = supabase
    .from("event_registrations")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (!opts?.includeRemoved) {
    q = q.is("removed_from_event_at", null);
  }
  const { data, error } = await q;

  if (error) {
    console.error("[eventRegRepo] getEventRegistrations:", error.message);
    return [];
  }
  return ensureRegistrationArray(data ?? []);
}

/**
 * Joint events: all participating-society registrations via SECURITY DEFINER RPC.
 * Falls back to society-scoped `getEventRegistrations` when RPC is unavailable.
 */
export async function getJointEventRegistrations(
  eventId: string,
  opts?: { includeRemoved?: boolean },
): Promise<JointEventRegistrationRow[]> {
  if (!eventId?.trim()) return [];

  try {
    const { data, error } = await supabase.rpc("get_joint_event_registrations", {
      p_event_id: eventId,
    });
    if (error) {
      console.warn(
        "[eventRegRepo] get_joint_event_registrations RPC unavailable; falling back to society-scoped SELECT (joint tee sheet may miss co-participant paid players until migration 167 is applied):",
        error.message,
      );
      return getEventRegistrations(eventId, opts) as JointEventRegistrationRow[];
    }

    let rows = (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      society_id: String(row.society_id ?? ""),
      event_id: String(row.event_id ?? ""),
      member_id: String(row.member_id ?? ""),
      status: (row.status === "out" ? "out" : "in") as "in" | "out",
      paid: Boolean(row.paid),
      amount_paid_pence: Number(row.amount_paid_pence ?? 0),
      paid_at: row.paid_at != null ? String(row.paid_at) : null,
      marked_by_member_id:
        row.marked_by_member_id != null ? String(row.marked_by_member_id) : null,
      created_at: String(row.created_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
      removed_from_event_at:
        row.removed_from_event_at != null ? String(row.removed_from_event_at) : null,
      removed_by_member_id:
        row.removed_by_member_id != null ? String(row.removed_by_member_id) : null,
      user_id: row.user_id != null ? String(row.user_id) : null,
      member_email: row.member_email != null ? String(row.member_email) : null,
      member_name: row.member_name != null ? String(row.member_name) : null,
      member_display_name:
        row.member_display_name != null ? String(row.member_display_name) : null,
    })) as JointEventRegistrationRow[];

    if (!opts?.includeRemoved) {
      rows = rows.filter(isOperationalEventRegistration);
    }
    return rows;
  } catch {
    return getEventRegistrations(eventId, opts) as JointEventRegistrationRow[];
  }
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
  return isOperationalEventRegistration(r) && r.status === "in";
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
 * Joint tee-sheet candidate pool — same merged resolver as Paid/Unpaid/Full status
 * (`resolveJointEventRegistrations`): host + guest society, paid + confirmed, de-duped.
 */
export async function getJointTeeSheetCandidatePoolForEvent(
  eventId: string,
  participantSocietyIds: string[],
  opts?: {
    societyIdToName?: Map<string, string>;
    participatingMembers?: MemberDoc[];
    guests?: EventGuest[];
    /** Pre-fetched joint registrations (avoids duplicate RPC round-trip). */
    registrations?: EventRegistration[] | JointEventRegistrationRow[];
  },
): Promise<{
  memberIds: string[];
  guestPlayerIds: string[];
  registrations: EventRegistration[];
  supportedStatuses: readonly string[];
}> {
  const [regs, guests] = await Promise.all([
    opts?.registrations
      ? Promise.resolve(ensureRegistrationArray(opts.registrations))
      : getJointEventRegistrations(eventId),
    opts?.guests ? Promise.resolve(opts.guests) : getEventGuests(eventId),
  ]);

  const societyIdToName =
    opts?.societyIdToName ??
    new Map(participantSocietyIds.filter(Boolean).map((id) => [id, id] as const));

  const resolution = resolveJointEventRegistrations({
    isJoint: true,
    regs,
    guests: guests.map((g) => ({
      id: g.id,
      society_id: g.society_id,
      name: g.name,
      paid: g.paid,
    })),
    activeSocietyId: participantSocietyIds[0] ?? "",
    participantSocietyIds,
    societyIdToName,
    participatingMembers: opts?.participatingMembers,
    attendingMembersOnly: true,
  });

  const scoped = scopeEventRegistrations(regs, {
    kind: "joint_participants",
    participantSocietyIds,
  });
  const filtered = scoped.filter(isTeeSheetEligible);

  const registrationSocietyIds = [...new Set(scoped.map((r) => String(r.society_id)).filter(Boolean))];
  if (participantSocietyIds.filter(Boolean).length >= 2 && registrationSocietyIds.length < 2) {
    console.warn("[eventRegRepo] joint tee sheet candidate pool: registrations cover only one society", {
      eventId,
      participantSocietyIds,
      registrationSocietyIds,
      registrationCount: scoped.length,
      eligibleCount: filtered.length,
    });
  }

  return {
    memberIds: resolution.teeSheetEligibleMemberIds,
    guestPlayerIds: resolution.teeSheetEligibleGuestPlayerIds,
    registrations: filtered,
    supportedStatuses: JOINT_TEE_SHEET_CANDIDATE_STATUSES,
  };
}

/**
 * Tee sheet generation (pairings / published tee sheet) — only these members are included.
 * Requires both confirmed attendance and payment recorded (paid ⇒ confirmed is enforced server-side).
 */
export function isTeeSheetEligible(r: EventRegistration): boolean {
  return isOperationalEventRegistration(r) && r.status === "in" && r.paid === true;
}

/** Standard event summaries (joint attendance uses event entries, not this). */
export function summarizeEventRegistrations(regs: EventRegistration[] | unknown) {
  const list = ensureRegistrationArray(regs).filter(isOperationalEventRegistration);
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
        removed_from_event_at: null,
        removed_by_member_id: null,
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

/**
 * Captain/Treasurer/Secretary/Handicapper: remove a society member from all operational
 * event views for the active society (soft-remove registration; strip player_ids / joint entries / tee slots).
 * Guests: use removeEventGuestFromEvent (eventGuestRepo) — not handled here.
 */
export async function removeEventParticipant(opts: {
  eventId: string;
  societyId: string;
  targetMemberId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("remove_event_participant", {
    p_event_id: opts.eventId,
    p_society_id: opts.societyId,
    p_target_member_id: opts.targetMemberId,
  });

  if (error) {
    console.error("[eventRegRepo] remove_event_participant RPC:", error.message);
    const msg = error.message || "";
    if (msg.includes("function public.remove_event_participant") && msg.includes("does not exist")) {
      throw new Error(
        "Database is out of date: apply migration 20260213120000_event_participant_soft_remove.sql, then retry.",
      );
    }
    throw new Error(msg || "Failed to remove participant from event");
  }
}
