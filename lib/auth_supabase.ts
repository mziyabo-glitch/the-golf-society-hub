// lib/auth_supabase.ts
// Auth helper functions using singleton supabase client
// All auth uses supabase-js, no manual fetch calls
// NO .select().single() after upsert to avoid 406 errors

import * as AuthSession from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

const WEB_BASE_URL = "https://the-golf-society-hub.vercel.app";

/** OAuth / magic-link redirect: native uses app scheme; web uses current origin when available. */
export function getAuthRedirectUri(): string {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}${window.location.pathname || "/"}`;
    }
    return WEB_BASE_URL;
  }
  return AuthSession.makeRedirectUri({ scheme: "thegolfsocietyhub" });
}

async function createSupabaseSessionFromOAuthRedirectUrl(
  url: string,
): Promise<{ session: Session | null; error: Error | null }> {
  const { params, errorCode } = QueryParams.getQueryParams(url);

  if (errorCode) {
    return { session: null, error: new Error(String(errorCode)) };
  }

  const oauthError = params.error;
  if (oauthError) {
    const desc = params.error_description
      ? decodeURIComponent(String(params.error_description).replace(/\+/g, " "))
      : oauthError;
    return { session: null, error: new Error(String(desc)) };
  }

  const code = typeof params.code === "string" ? params.code : undefined;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { session: null, error };
    if (!data.session) {
      return { session: null, error: new Error("No session after code exchange") };
    }
    return { session: data.session, error: null };
  }

  const access_token =
    typeof params.access_token === "string" ? params.access_token : undefined;
  const refresh_token =
    typeof params.refresh_token === "string" ? params.refresh_token : undefined;

  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) return { session: null, error };
    return { session: data.session ?? null, error: null };
  }

  return {
    session: null,
    error: new Error("Missing auth tokens in OAuth redirect URL"),
  };
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
 * Sign in with Google OAuth.
 * On web: redirects to Google, then back to app with session in URL.
 * Configure redirect URLs in Supabase Dashboard → Auth → URL Configuration.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  console.log("[auth] signInWithGoogle");

  const redirectTo = getAuthRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    console.error("[auth] signInWithGoogle error:", error.message);
    return { data: null, error };
  }

  const authUrl = data?.url;
  if (!authUrl) {
    return { data: null, error: new Error("OAuth redirect URL not returned") };
  }

  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.location?.assign) {
      window.location.assign(authUrl);
      return { data: null, error: null };
    }
    return { data: null, error: new Error("Cannot start OAuth on this web environment") };
  }

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

  if (result.type === "cancel") {
    return { data: null, error: new Error("Sign in cancelled") };
  }

  if (result.type !== "success" || !result.url) {
    return { data: null, error: new Error("OAuth session incomplete") };
  }

  const { session, error: sessionErr } = await createSupabaseSessionFromOAuthRedirectUrl(
    result.url,
  );

  if (sessionErr || !session?.user) {
    return {
      data: null,
      error: sessionErr ?? new Error("Failed to complete Google sign in"),
    };
  }

  return { data: { user: session.user, session }, error: null };
}

/**
 * Sign in with magic link (passwordless email).
 * Sends a link to the user's email; they click it to sign in.
 */
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return { error: new Error("Email is required") };
  }

  console.log("[auth] signInWithMagicLink", cleanEmail);

  const redirectTo = getAuthRedirectUri();

  const { error } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    console.error("[auth] signInWithMagicLink error:", error.message);
    return { error };
  }

  return { error: null };
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
