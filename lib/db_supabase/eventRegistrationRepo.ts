// lib/db_supabase/eventRegistrationRepo.ts
// MVP data layer for event_registrations (attendance + payment).

import { supabase } from "@/lib/supabase";

export type EventRegistration = {
  id: string;
  society_id: string;
  event_id: string;
  member_id: string;
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
 */
export async function markMePaid(
  eventId: string,
  memberId: string,
  paid: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("mark_event_paid", {
    p_event_id: eventId,
    p_target_member_id: memberId,
    p_paid: paid,
    p_amount_pence: 0,
  });

  if (error) {
    console.error("[eventRegRepo] markMePaid RPC:", error.message);
    throw new Error(error.message || "Failed to update payment status");
  }
}
