import { supabase } from "@/lib/supabase";

/** Returns stable secret token for this user + society (creates row on first use). */
export async function ensureCalendarFeedToken(societyId: string): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_calendar_feed_token", {
    p_society_id: societyId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Calendar token not returned");
  }
  return data.trim();
}

/** New secret token; previous /api/calendar/{old}.ics URLs stop working immediately. */
export async function rotateCalendarFeedToken(societyId: string): Promise<string> {
  const { data, error } = await supabase.rpc("rotate_calendar_feed_token", {
    p_society_id: societyId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data.trim()) {
    throw new Error("Calendar token not returned");
  }
  return data.trim();
}
