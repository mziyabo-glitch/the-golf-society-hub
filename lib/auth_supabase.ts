import { supabase } from "@/lib/supabase";

/**
 * Ensure we have a signed-in user (anonymous).
 * With Option B, the session is persisted securely via SecureStore.
 */
export async function ensureSignedIn() {
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.user) {
    return existing.data.session.user;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Supabase: no user returned from signInAnonymously()");
  return data.user;
}

/**
 * Ensure a profile row exists for this user.
 */
export async function ensureProfile(userId: string) {
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("profiles")
    .insert({ id: userId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update active society / member pointers on the profile.
 */
export async function updateActiveSociety(params: {
  userId: string;
  activeSocietyId: string | null;
  activeMemberId: string | null;
}) {
  const { error } = await supabase
    .from("profiles")
    .update({
      active_society_id: params.activeSocietyId,
      active_member_id: params.activeMemberId,
    })
    .eq("id", params.userId);

  if (error) throw error;
}
