// lib/db_supabase/societyRepo.ts
import { supabase } from "@/lib/supabase";

export type SocietyDoc = {
  id: string;
  name: string;
  country: string;
  join_code?: string;
  created_at?: string;
  created_by?: string;
  home_course_id?: string | null;
  home_course?: string | null;
  scoring_mode?: "Stableford" | "Strokeplay" | "Both";
  handicap_rule?: "Allow WHS" | "Fixed HCP" | "No HCP";
  logo_url?: string | null;
  admin_pin?: string;
  annual_fee?: number;
  updated_at?: string;
};

type SocietyInput = {
  name: string;
  country: string;
  createdBy: string;
  homeCourseId?: string | null;
  homeCourse?: string;
  scoringMode?: "Stableford" | "Strokeplay" | "Both";
  handicapRule?: "Allow WHS" | "Fixed HCP" | "No HCP";
  logoUrl?: string | null;
};

/**
 * Generate a unique, human-friendly join code
 * Format: 6 uppercase alphanumeric characters (no confusing chars like 0/O, 1/I/L)
 */
function generateJoinCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createSociety(input: SocietyInput): Promise<SocietyDoc> {
  const joinCode = generateJoinCode();

  const payload = {
    name: input.name,
    country: input.country,
    created_by: input.createdBy,
    join_code: joinCode,
    home_course_id: input.homeCourseId ?? null,
    home_course: input.homeCourse?.trim() || null,
    scoring_mode: input.scoringMode ?? null,
    handicap_rule: input.handicapRule ?? null,
    logo_url: input.logoUrl ?? null,
  };

  const { data, error } = await supabase
    .from("societies")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getSocietyDoc(id: string): Promise<SocietyDoc | null> {
  const { data, error } = await supabase
    .from("societies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateSocietyDoc(
  id: string,
  updates: Partial<SocietyDoc>
): Promise<void> {
  const { error } = await supabase
    .from("societies")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

/**
 * Find a society by its join code.
 * Returns the society doc if found, null if not found.
 */
export async function findSocietyByJoinCode(
  joinCode: string
): Promise<SocietyDoc | null> {
  const normalizedCode = joinCode.trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length < 4) {
    return null;
  }

  const { data, error } = await supabase
    .from("societies")
    .select("*")
    .eq("join_code", normalizedCode)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Regenerate join code for a society (Captain only)
 */
export async function regenerateJoinCode(societyId: string): Promise<string> {
  const newCode = generateJoinCode();
  await updateSocietyDoc(societyId, { join_code: newCode });
  return newCode;
}
