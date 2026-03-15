// lib/auth_supabase.ts
// Auth helper functions using singleton supabase client
// All auth uses supabase-js, no manual fetch calls
// NO .select().single() after upsert to avoid 406 errors

import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

const WEB_BASE_URL = "https://the-golf-society-hub.vercel.app";
const AUTH_CALLBACK_PATH = "/auth/callback";

/**
 * Get the redirect URL for OAuth and magic link.
 * Web: /auth/callback on same origin
 * Native: Expo scheme (thegolfsocietyhub://auth/callback)
 */
export function getAuthRedirectUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
  }
  if (Platform.OS === "web") {
    return `${WEB_BASE_URL}${AUTH_CALLBACK_PATH}`;
  }
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

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

export type SignInResult = { data: { user: User; session: Session } | null; error: Error | null };

/**
 * Sign in with email and password.
 * Returns { data, error } so the caller can react to success (data.session) or show error.message.
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<SignInResult> {
  const cleanEmail = email.trim().toLowerCase();
  console.log("[auth] signInWithEmail", { step: "signIn", email: cleanEmail });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  // Temporary debug log for sign-in response
  console.log("[auth] signInWithPassword returned:", {
    hasData: !!data,
    hasSession: !!data?.session,
    hasUser: !!data?.user,
    error: error ? { message: error.message, code: error.status } : null,
  });

  if (error) {
    console.error("[auth] signInWithEmail error:", {
      step: "signIn",
      email: cleanEmail,
      code: error.status,
      message: error.message,
      name: error.name,
    });
    return { data: null, error };
  }

  if (!data?.user) {
    const err = new Error("Sign in failed — no user returned.") as Error & { status?: number };
    return { data: null, error: err };
  }

  console.log("[auth] signInWithEmail success:", data.user.id);
  return { data: data as { user: User; session: Session }, error: null };
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

// ============================================================================
// OAuth (Google, Apple)
// ============================================================================

export type OAuthProvider = "google" | "apple";

/**
 * Sign in with OAuth provider (Google or Apple).
 * Opens browser/WebView for auth flow. Redirect URL must be configured in Supabase Dashboard.
 */
export async function signInWithOAuth(
  provider: OAuthProvider
): Promise<{ data: { url: string } | null; error: Error | null }> {
  const redirectTo = getAuthRedirectUrl();
  console.log("[auth] signInWithOAuth", { provider, redirectTo });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== "web",
    },
  });

  if (error) {
    console.error("[auth] signInWithOAuth error:", error.message);
    return { data: null, error };
  }

  if (data?.url) {
    return { data: { url: data.url }, error: null };
  }

  return { data: null, error: new Error("No OAuth URL returned") };
}

// ============================================================================
// Magic Link / One-Time Code (Email)
// ============================================================================

/**
 * Sign in with magic link — sends email with one-time link.
 * User clicks link and is redirected to auth callback.
 */
export async function signInWithMagicLink(
  email: string
): Promise<{ data: { message: string } | null; error: Error | null }> {
  const cleanEmail = email.trim().toLowerCase();
  const redirectTo = getAuthRedirectUrl();
  console.log("[auth] signInWithMagicLink", { email: cleanEmail, redirectTo });

  const { data, error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithMagicLink error:", error.message);
    return { data: null, error };
  }

  return {
    data: {
      message: "Check your email for a sign-in link. Click it to continue.",
    },
    error: null,
  };
}

/**
 * Verify OTP code (for email OTP flow if enabled in Supabase).
 * Alternative to magic link when using 6-digit codes.
 */
export async function verifyOtp(
  email: string,
  token: string
): Promise<SignInResult> {
  const cleanEmail = email.trim().toLowerCase();
  console.log("[auth] verifyOtp", { email: cleanEmail });

  const { data, error } = await supabase.auth.verifyOtp({
    email: cleanEmail,
    token,
    type: "email",
  });

  if (error) {
    console.error("[auth] verifyOtp error:", error.message);
    return { data: null, error };
  }

  if (!data?.user || !data?.session) {
    return { data: null, error: new Error("Verification failed — no session") };
  }

  return { data: data as { user: User; session: Session }, error: null };
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
