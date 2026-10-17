// lib/pendingSocietyJoinCode.ts
// Persists a pending society join code when user opens captain's invite link before signing in.
// After auth, the app resumes the join flow with the stored code.

import { supabaseStorage } from "@/lib/supabaseStorage";
import { normalizeJoinCode } from "@/lib/db_supabase/societyRepo";

const KEY = "pending-society-join-code";

/**
 * Store a pending society join code before redirecting to auth.
 */
export async function storePendingSocietyJoinCode(code: string): Promise<void> {
  const normalized = normalizeJoinCode(String(code));
  if (normalized) {
    await supabaseStorage.setItem(KEY, normalized);
  }
}

/**
 * Retrieve and clear the pending society join code after login.
 * Returns null if no pending code.
 */
export async function consumePendingSocietyJoinCode(): Promise<string | null> {
  const code = await supabaseStorage.getItem(KEY);
  if (code) {
    await supabaseStorage.removeItem(KEY);
  }
  return code;
}
