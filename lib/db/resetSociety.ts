import { supabase } from "@/lib/supabase";

/**
 * Best-effort client-side reset (Supabase).
 *
 * WARNING:
 * - This performs multiple deletes and assumes RLS allows the caller.
 * - For large datasets, move this to a privileged backend.
 */
export async function resetSocietyData(societyId: string): Promise<void> {
  if (!societyId) throw new Error("resetSocietyData: missing societyId");

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id")
    .eq("society_id", societyId);

  if (eventsError) {
    throw new Error(eventsError.message || "Failed to load events");
  }

  const eventIds = (events ?? []).map((e: any) => e.id);

  if (eventIds.length > 0) {
    const { error: expError } = await supabase
      .from("event_expenses")
      .delete()
      .in("event_id", eventIds);
    if (expError) {
      throw new Error(expError.message || "Failed to delete event expenses");
    }

    const { error: payError } = await supabase
      .from("event_payments")
      .delete()
      .in("event_id", eventIds);
    if (payError) {
      throw new Error(payError.message || "Failed to delete event payments");
    }
  }

  const { error: eventsDeleteError } = await supabase
    .from("events")
    .delete()
    .eq("society_id", societyId);
  if (eventsDeleteError) {
    throw new Error(eventsDeleteError.message || "Failed to delete events");
  }

  const { error: membersError } = await supabase
    .from("members")
    .delete()
    .eq("society_id", societyId);
  if (membersError) {
    throw new Error(membersError.message || "Failed to delete members");
  }

  const { error: coursesError } = await supabase
    .from("courses")
    .delete()
    .eq("society_id", societyId);
  if (coursesError) {
    throw new Error(coursesError.message || "Failed to delete courses");
  }

  const { error: teesError } = await supabase
    .from("teesets")
    .delete()
    .eq("society_id", societyId);
  if (teesError) {
    throw new Error(teesError.message || "Failed to delete tee sets");
  }

  const { error: societyError } = await supabase
    .from("societies")
    .delete()
    .eq("id", societyId);
  if (societyError) {
    throw new Error(societyError.message || "Failed to delete society");
  }
}
