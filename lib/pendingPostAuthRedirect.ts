// Persists a post–sign-in redirect (e.g. return to /invite/{eventUuid} after public RSVP gate).

import { supabaseStorage } from "@/lib/supabaseStorage";

const KEY = "pending-post-auth-redirect";

export async function storePendingPostAuthRedirect(path: string): Promise<void> {
  const p = String(path || "").trim();
  if (p.startsWith("/")) {
    await supabaseStorage.setItem(KEY, p);
  }
}

export async function consumePendingPostAuthRedirect(): Promise<string | null> {
  const v = await supabaseStorage.getItem(KEY);
  if (v) {
    await supabaseStorage.removeItem(KEY);
  }
  return v;
}

/** Clears a stored redirect when it matches the current path (e.g. OAuth returns directly to the invite URL). */
export async function clearPendingPostAuthRedirectIfMatches(expectedPath: string): Promise<void> {
  const v = await supabaseStorage.getItem(KEY);
  if (v && v === expectedPath) {
    await supabaseStorage.removeItem(KEY);
  }
}
