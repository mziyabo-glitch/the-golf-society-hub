import { supabase } from "@/lib/supabase";

export type OAuthCallbackResult = {
  success: boolean;
  error?: string;
  source?: "existing" | "code" | "hash" | "delayed";
};

function getQueryCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    return code && code.trim().length > 0 ? code : null;
  } catch {
    return null;
  }
}

function getHashTokens(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  } catch {
    return null;
  }
}

export function clearOAuthCallbackUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const cleanPath = window.location.pathname;
    window.history.replaceState(null, "", cleanPath);
  } catch {
    // no-op
  }
}

export async function establishOAuthSessionFromCurrentUrl(): Promise<OAuthCallbackResult> {
  try {
    const { data: currentData, error: currentErr } = await supabase.auth.getSession();
    if (currentErr) {
      return { success: false, error: currentErr.message };
    }
    if (currentData.session) {
      return { success: true, source: "existing" };
    }

    const code = getQueryCode();
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        return { success: false, error: exchangeError.message };
      }
      const { data: exchangedData } = await supabase.auth.getSession();
      if (exchangedData.session) {
        return { success: true, source: "code" };
      }
    }

    const tokens = getHashTokens();
    if (tokens) {
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (setSessionError) {
        return { success: false, error: setSessionError.message };
      }
      const { data: hashData } = await supabase.auth.getSession();
      if (hashData.session) {
        return { success: true, source: "hash" };
      }
    }

    // Final delayed check for any asynchronous auth processing
    await new Promise((r) => setTimeout(r, 1200));
    const { data: delayedData, error: delayedErr } = await supabase.auth.getSession();
    if (delayedErr) {
      return { success: false, error: delayedErr.message };
    }
    if (delayedData.session) {
      return { success: true, source: "delayed" };
    }

    return { success: false, error: "Could not complete OAuth sign-in." };
  } catch (e: any) {
    return { success: false, error: e?.message || "OAuth callback failed." };
  }
}
