// lib/db_supabase/eventRegistrationRepo.ts
// Data layer for event_registrations (attendance + payment tracking).

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
 */
export async function getMyEventRegistration(
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
    console.error("[eventRegRepo] getMyEventRegistration error:", error.message);
    return null;
  }
  return data as EventRegistration | null;
}

/**
 * Fetch all registrations for a given event (for captain payment list).
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
    console.error("[eventRegRepo] getEventRegistrations error:", error.message);
    return [];
  }
  return (data ?? []) as EventRegistration[];
}

/**
 * Upsert the current member's registration status ('in' or 'out').
 * Uses the (event_id, member_id) unique constraint for idempotency.
 */
export async function upsertMyRegistration(
  eventId: string,
  societyId: string,
  memberId: string,
  status: "in" | "out",
): Promise<EventRegistration | null> {
  const { data, error } = await supabase
    .from("event_registrations")
    .upsert(
      {
        event_id: eventId,
        society_id: societyId,
        member_id: memberId,
        status,
      },
      { onConflict: "event_id,member_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("[eventRegRepo] upsertMyRegistration error:", error.message);
    throw new Error(error.message || "Failed to update registration");
  }
  return data as EventRegistration;
}

/**
 * Captain/Treasurer marks a member paid/unpaid via the server-side RPC.
 */
export async function markPaid(
  eventId: string,
  targetMemberId: string,
  paid: boolean,
  amountPence: number = 0,
): Promise<void> {
  const { error } = await supabase.rpc("mark_event_paid", {
    p_event_id: eventId,
    p_member_id: targetMemberId,
    p_paid: paid,
    p_amount_pence: amountPence,
  });

  if (error) {
    console.error("[eventRegRepo] markPaid RPC error:", error.message);
    throw new Error(error.message || "Failed to update payment status");
  }
}
