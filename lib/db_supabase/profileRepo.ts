// lib/db_supabase/profileRepo.ts
import { supabase } from "@/lib/supabase";

export type ProfileDoc = {
  id: string;
  active_society_id: string | null;
  active_member_id: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * Ensure profile exists for user
 */
export async function ensureProfile(userId: string): Promise<ProfileDoc> {
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
 * Get profile by user ID
 */
export async function getProfile(userId: string): Promise<ProfileDoc | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Update profile fields
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Omit<ProfileDoc, "id">>
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw error;
}

/**
 * Set active society + member
 * Called after Create Society or Join Society
 */
export async function setActiveSocietyAndMember(
  userId: string,
  societyId: string,
  memberId: string
): Promise<void> {
  await updateProfile(userId, {
    active_society_id: societyId,
    active_member_id: memberId,
  });
}

/**
 * Reset society (leave / reset flow)
 */
export async function clearActiveSociety(userId: string): Promise<void> {
  await updateProfile(userId, {
    active_society_id: null,
    active_member_id: null,
  });
}
