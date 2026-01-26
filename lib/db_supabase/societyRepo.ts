// lib/db_supabase/societyRepo.ts
import { supabase } from "@/lib/supabase";

export type SocietyDoc = {
  id: string;
  name: string;
  country?: string;
  join_code?: string;
  created_at?: string;
  created_by?: string;
  home_course_id?: string | null;
  home_course?: string | null;
  scoring_mode?: string | null;
  handicap_rule?: string | null;
  logo_url?: string | null;
  admin_pin?: string;
  annual_fee?: number;
  updated_at?: string;
};

type SocietyInput = {
  name: string;
  country?: string;
  createdBy: string;
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

  // Minimal payload - only essential columns
  // Add country only if provided (column may or may not exist in schema)
  const payload: Record<string, unknown> = {
    name: input.name,
    created_by: input.createdBy,
    join_code: joinCode,
  };

  // Only add country if provided and not empty
  if (input.country?.trim()) {
    payload.country = input.country.trim();
  }

  console.log("[societyRepo] createSociety payload:", JSON.stringify(payload, null, 2));

  const { data, error } = await supabase
    .from("societies")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("[societyRepo] createSociety failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to create society");
  }

  console.log("[societyRepo] createSociety success:", data?.id);
  return data;
}

export async function getSocietyDoc(id: string): Promise<SocietyDoc | null> {
  const { data, error } = await supabase
    .from("societies")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[societyRepo] getSocietyDoc failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to get society");
  }
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

  if (error) {
    console.error("[societyRepo] updateSocietyDoc failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to update society");
  }
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

  if (error) {
    console.error("[societyRepo] findSocietyByJoinCode failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(error.message || "Failed to find society");
  }
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
