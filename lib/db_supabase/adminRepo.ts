// lib/db_supabase/adminRepo.ts
// Platform admin operations (re-appoint captain, etc.).

import { supabase } from "@/lib/supabase";

/**
 * Check whether the current auth user is a platform admin.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}

/**
 * Re-appoint captain for a society via the server-side RPC.
 * Only callable by platform admins.
 */
export async function reappointCaptain(
  societyId: string,
  newCaptainMemberId: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc("reappoint_captain", {
    p_society_id: societyId,
    p_new_captain_member_id: newCaptainMemberId,
    p_reason: reason,
  });

  if (error) {
    console.error("[adminRepo] reappointCaptain:", error.message);
    throw new Error(error.message || "Failed to re-appoint captain");
  }
}
