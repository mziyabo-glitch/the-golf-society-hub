// lib/auth_supabase.ts
// Auth helper functions using singleton supabase client
// All auth uses supabase-js, no manual fetch calls
// NO .select().single() after upsert to avoid 406 errors

import { Platform, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

const WEB_BASE_URL = "https://the-golf-society-hub.vercel.app";

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get the current session (from memory/localStorage)
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error("[auth] getSession error:", error.message);
    return null;
  }

  return session;
}

/**
 * Get the current user from the session
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth] getCurrentUser error:", error.message);
    return null;
  }

  return user;
}

// ============================================================================
// Sign In / Sign Up / Sign Out
// ============================================================================

/**
 * Sign in with email and password.
 * Returns the user on success, throws on error.
 * Surfaces the real Supabase error message for debugging.
 */
export async function signInWithEmail(email: string, password: string): Promise<User> {
  const cleanEmail = email.trim().toLowerCase();
  console.log("[auth] signInWithEmail", { step: "signIn", email: cleanEmail });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error) {
    console.error("[auth] signInWithEmail error:", {
      step: "signIn",
      email: cleanEmail,
      code: error.status,
      message: error.message,
      name: error.name,
    });
    throw new Error(error.message || "Sign in failed.");
  }

  if (!data.user) {
    throw new Error("Sign in failed — no user returned.");
  }

  console.log("[auth] signInWithEmail success:", data.user.id);
  return data.user;
}

/**
 * Sign up with email and password.
 * Returns the user on success, throws on error.
 * Surfaces the real Supabase error message for debugging.
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ user: User; needsConfirmation: boolean }> {
  const cleanEmail = email.trim().toLowerCase();
  console.log("[auth] signUpWithEmail", { step: "signUp", email: cleanEmail });

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
  });

  if (error) {
    console.error("[auth] signUpWithEmail error:", {
      step: "signUp",
      email: cleanEmail,
      code: error.status,
      message: error.message,
      name: error.name,
    });
    throw new Error(error.message || "Sign up failed.");
  }

  if (!data.user) {
    throw new Error("Sign up failed — no user returned.");
  }

  console.log("[auth] signUpWithEmail response:", {
    step: "signUp",
    email: cleanEmail,
    userId: data.user.id,
    identitiesCount: data.user.identities?.length ?? "N/A",
    hasSession: !!data.session,
    confirmedAt: data.user.confirmed_at ?? "not confirmed",
  });

  // Supabase quirk: when email confirmations are ON and the email already
  // exists, signUp returns a user object with an empty identities array
  // instead of an error.
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error("An account with this email already exists. Try signing in instead.");
  }

  // If no session came back, the user needs to confirm their email first.
  const needsConfirmation = !data.session;

  return { user: data.user, needsConfirmation };
}

// ============================================================================
// Google OAuth
// ============================================================================

/**
 * Sign in with Google OAuth.
 *
 * Web:    Uses supabase.auth.signInWithOAuth — Supabase handles the redirect.
 *         The browser navigates away and returns to /auth/callback with a PKCE
 *         code (default) or tokens in the hash.  The oauthCallback module
 *         handles session establishment on the callback page.
 *
 * Native: Uses expo-web-browser to open the OAuth URL in an in-app browser.
 *         skipBrowserRedirect: true prevents Supabase from redirecting the main page.
 *         We extract the PKCE code (or implicit hash tokens) from the browser
 *         result and exchange them for a session.
 *         Supabase JS v2.39+ defaults to PKCE (response_type=code), so we
 *         prioritize code exchange and fall back to implicit hash tokens.
 */
export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === "web") {
    // Web: let Supabase redirect the browser back to the current origin
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : `${WEB_BASE_URL}/auth/callback`;
    console.log("[auth] signInWithGoogle (web)", { redirectTo });

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      console.error("[auth] signInWithGoogle error:", error.message);
      throw new Error(error.message);
    }
    // Browser navigates away — nothing more to do here.
    return;
  }

  // Native: open in-app browser, parse tokens from callback URL
  const redirectTo = Linking.createURL("auth/callback");
  console.log("[auth] signInWithGoogle (native)", { redirectTo });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    console.error("[auth] signInWithGoogle native error:", error?.message);
    throw new Error(error?.message || "Failed to start Google sign-in.");
  }

  // Open the OAuth URL in an in-app browser
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== "success" || !result.url) {
    console.log("[auth] signInWithGoogle cancelled or failed:", result.type);
    return; // user cancelled — not an error
  }

  // Parse the callback URL — handle both PKCE flow (code in query string)
  // and implicit flow (tokens in hash fragment).
  // Supabase JS v2.39+ defaults to PKCE, so the code path is tried first.
  const callbackUrl = result.url;

  // --- PKCE flow: extract code from query string ---
  const codeMatch = callbackUrl.match(/[?&]code=([^&#]+)/);
  if (codeMatch) {
    const code = decodeURIComponent(codeMatch[1]);
    console.log("[auth] signInWithGoogle native: PKCE code found, exchanging...");

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("[auth] signInWithGoogle exchangeCode error:", exchangeError.message);
      throw new Error(exchangeError.message);
    }

    console.log("[auth] signInWithGoogle native: PKCE session established");
    return;
  }

  // --- Implicit flow fallback: extract tokens from hash ---
  const hashPart = callbackUrl.split("#")[1];
  if (hashPart) {
    const params = new URLSearchParams(hashPart);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (accessToken && refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (sessionError) {
        console.error("[auth] signInWithGoogle setSession error:", sessionError.message);
        throw new Error(sessionError.message);
      }

      console.log("[auth] signInWithGoogle native: implicit session established");
      return;
    }
  }

  // Neither flow produced tokens — something went wrong
  console.error("[auth] signInWithGoogle native: no code or tokens in callback URL:", callbackUrl);
  throw new Error("No authentication credentials found in callback URL.");
}

// ============================================================================
// Password Reset
// ============================================================================

/**
 * Send a password reset email.
 * Supabase will send a link to the user's email.
 * Uses the stable production URL so the redirect always matches the
 * Supabase allowlist (preview URLs change per Vercel deployment).
 */
const RESET_REDIRECT_URL = `${WEB_BASE_URL}/reset-password`;

export async function resetPassword(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  console.log("[auth] resetPassword", {
    email: cleanEmail,
    redirectTo: RESET_REDIRECT_URL,           // beta: verify correct URL
  });

  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: RESET_REDIRECT_URL,
  });

  if (error) {
    console.error("[auth] resetPassword error:", {
      email: cleanEmail,
      code: error.status,
      message: error.message,
    });
    throw new Error(error.message || "Failed to send reset email.");
  }

  console.log("[auth] resetPassword email sent to:", cleanEmail);
}

/**
 * Ensure user is signed in. If no session exists, throw.
 * Returns the user object.
 */
export async function ensureSignedIn(): Promise<User> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error("[auth] getSession error:", sessionError.message);
  }

  if (session?.user) {
    console.log("[auth] Existing session for user:", session.user.id);
    return session.user;
  }

  throw new Error("Not signed in. Please use the email link to sign in.");
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[auth] signOut error:", error.message);
    throw new Error(`Sign out failed: ${error.message}`);
  }

  console.log("[auth] Signed out successfully");
}

// ============================================================================
// Profile Management
// ============================================================================

/**
 * Ensure a profile row exists for the user.
 * Uses upsert WITHOUT .select().single() to avoid 406 errors,
 * then fetches separately with .maybeSingle()
 */
export async function ensureProfile(userId: string): Promise<any> {
  console.log("[auth] Ensuring profile for:", userId);

  // Step 1: Upsert WITHOUT .select().single()
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId },
      { onConflict: "id" }
    );

  if (upsertError) {
    console.warn("[auth] Profile upsert warning:", upsertError.message);
    // Don't throw - profile might already exist
  }

  // Step 2: Fetch profile with .maybeSingle()
  const { data, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selectError) {
    console.error("[auth] Profile select error:", selectError.message);
    throw new Error(`Failed to load profile: ${selectError.message}`);
  }

  if (!data) {
    console.error("[auth] No profile found after upsert");
    throw new Error("Profile not found");
  }

  console.log("[auth] Profile loaded:", data.id);
  return data;
}

/**
 * Update active society and member on the profile
 */
export async function updateActiveSociety(params: {
  userId: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
}): Promise<void> {
  console.log("[auth] updateActiveSociety:", params);

  const { error } = await supabase
    .from("profiles")
    .update({
      active_society_id: params.activeSocietyId,
      active_member_id: params.activeMemberId,
    })
    .eq("id", params.userId);

  if (error) {
    console.error("[auth] updateActiveSociety error:", error.message);
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  console.log("[auth] updateActiveSociety success");
}

/**
 * Clear active society (for "leave society" flow)
 */
export async function clearActiveSociety(userId: string): Promise<void> {
  await updateActiveSociety({
    userId,
    activeSocietyId: null,
    activeMemberId: null,
  });
}

// ============================================================================
// Auth State Verification
// ============================================================================

/**
 * Verify that the current auth state matches expected user ID.
 * Useful before operations that require auth.uid() to match a specific user.
 */
export async function verifyAuthState(expectedUserId: string): Promise<void> {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    console.error("[auth] verifyAuthState error:", error.message);
    throw new Error(`Auth verification failed: ${error.message}`);
  }

  if (!user) {
    throw new Error("No authenticated user");
  }

  if (user.id !== expectedUserId) {
    console.error("[auth] User ID mismatch:", { expected: expectedUserId, actual: user.id });
    throw new Error("Auth state mismatch");
  }

  console.log("[auth] Auth state verified for:", user.id);
}
