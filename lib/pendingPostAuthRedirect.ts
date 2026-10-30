// Persists a post–sign-in redirect (e.g. return to /invite/{eventUuid} after public RSVP gate).
// Web uses sessionStorage so the path survives "remember me" off (supabaseStorage skips writes then).

import { Platform } from "react-native";

import { supabaseStorage } from "@/lib/supabaseStorage";

const KEY = "pending-post-auth-redirect";
const WEB_STORAGE_KEY = `gsh:${KEY}`;

function webGet(): string | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  return window.sessionStorage.getItem(WEB_STORAGE_KEY);
}

function webSet(path: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  window.sessionStorage.setItem(WEB_STORAGE_KEY, path);
}

function webRemove(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  window.sessionStorage.removeItem(WEB_STORAGE_KEY);
}

export async function storePendingPostAuthRedirect(path: string): Promise<void> {
  const p = String(path || "").trim();
  if (!p.startsWith("/")) return;
  if (Platform.OS === "web") {
    webSet(p);
    return;
  }
  await supabaseStorage.setItem(KEY, p);
}

export async function consumePendingPostAuthRedirect(): Promise<string | null> {
  if (Platform.OS === "web") {
    const v = webGet();
    if (v) webRemove();
    return v;
  }
  const v = await supabaseStorage.getItem(KEY);
  if (v) {
    await supabaseStorage.removeItem(KEY);
  }
  return v;
}

/** Clears a stored redirect when it matches the current path (e.g. OAuth returns directly to the invite URL). */
export async function clearPendingPostAuthRedirectIfMatches(expectedPath: string): Promise<void> {
  if (Platform.OS === "web") {
    const v = webGet();
    if (v && v === expectedPath) webRemove();
    return;
  }
  const v = await supabaseStorage.getItem(KEY);
  if (v && v === expectedPath) {
    await supabaseStorage.removeItem(KEY);
  }
}
