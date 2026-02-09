// lib/sinbookInviteToken.ts
// Persists a pending sinbook invite token across login/signup flow.
// Uses the same cross-platform storage adapter as Supabase auth.

import { supabaseStorage } from "@/lib/supabaseStorage";

const KEY = "sinbook-pending-invite";

/**
 * Store a pending invite token (sinbook ID) before redirecting to login.
 */
export async function storePendingInviteToken(token: string): Promise<void> {
  await supabaseStorage.setItem(KEY, token);
}

/**
 * Retrieve and clear the pending invite token after login.
 * Returns null if no pending invite.
 */
export async function consumePendingInviteToken(): Promise<string | null> {
  const token = await supabaseStorage.getItem(KEY);
  if (token) {
    await supabaseStorage.removeItem(KEY);
  }
  return token;
}
