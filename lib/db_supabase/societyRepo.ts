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

// Result type for join code lookup - distinguishes between different failure modes
export type JoinCodeLookupResult =
  | { ok: true; society: SocietyDoc }
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" | "ERROR"; message?: string };

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

/**
 * Normalize a join code for consistent lookup:
 * - Trim whitespace
 * - Remove ALL internal spaces
 * - Convert to uppercase
 */
export function normalizeJoinCode(code: string): string {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

export async function createSociety(input: SocietyInput): Promise<SocietyDoc> {
  // CRITICAL: Verify auth state before insert
  // RLS policy requires: created_by = auth.uid()
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error("[societyRepo] Auth error before createSociety:", authError.message);
    throw new Error("Authentication error: " + authError.message);
  }

  if (!user) {
    console.error("[societyRepo] No authenticated user found");
    throw new Error("You must be signed in to create a society.");
  }

  // Verify the createdBy matches the authenticated user
  if (user.id !== input.createdBy) {
    console.error("[societyRepo] User ID mismatch:", {
      authUid: user.id,
      createdBy: input.createdBy,
    });
    throw new Error("Authentication mismatch. Please refresh and try again.");
  }

  console.log("[societyRepo] Auth verified. User ID:", user.id);

  const joinCode = generateJoinCode();

  // Minimal payload - only essential columns
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

    // Provide more helpful error message for RLS failures
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error(
        "Permission denied. Please ensure anonymous sign-ins are enabled in Supabase Auth settings, " +
        "and the RLS policy allows inserts where created_by = auth.uid()."
      );
    }

    throw new Error(error.message || "Failed to create society");
  }

  console.log("[societyRepo] createSociety success:", data?.id, "joinCode:", data?.join_code);
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
 * Returns structured result to distinguish between:
 * - NOT_FOUND: no society with that code
 * - FORBIDDEN: RLS policy blocked the query
 * - ERROR: other database error
 */
export async function lookupSocietyByJoinCode(
  joinCode: string
): Promise<JoinCodeLookupResult> {
  // Normalize: trim, remove ALL spaces, uppercase
  const normalized = normalizeJoinCode(joinCode);

  console.log("[join] lookupSocietyByJoinCode:", {
    raw: joinCode,
    normalized: normalized,
    length: normalized.length,
  });

  // Validate minimum length
  if (!normalized || normalized.length < 4) {
    console.warn("[join] Join code too short:", normalized);
    return { ok: false, reason: "NOT_FOUND", message: "Join code must be at least 4 characters" };
  }

  // Check auth state before query (for debugging RLS issues)
  const { data: authData } = await supabase.auth.getUser();
  const authUid = authData?.user?.id;
  console.log("[join] Auth state before lookup:", {
    authenticated: !!authUid,
    uid: authUid ? authUid.substring(0, 8) + "..." : "none",
  });

  // Query with explicit column selection for debugging
  const { data, error } = await supabase
    .from("societies")
    .select("id, join_code, name, country, created_by")
    .eq("join_code", normalized)
    .limit(1)
    .maybeSingle();

  // Handle errors first
  if (error) {
    console.error("[join] society lookup error:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Check for RLS/permission errors
    if (
      error.code === "42501" ||
      error.code === "PGRST301" ||
      error.message?.includes("row-level security") ||
      error.message?.includes("permission denied")
    ) {
      return {
        ok: false,
        reason: "FORBIDDEN",
        message: "Permission denied. RLS policy may be blocking society lookup.",
      };
    }

    return {
      ok: false,
      reason: "ERROR",
      message: error.message || "Database error during lookup",
    };
  }

  // Handle not found - could be RLS hiding rows OR genuinely not found
  if (!data) {
    console.warn("[join] RLS_OR_NOT_FOUND: No society returned for code:", {
      joinCode: normalized,
      authenticated: !!authUid,
      hint: "If society exists but RLS returns 0 rows, check that societies_select policy allows authenticated users to see rows with join_code IS NOT NULL",
    });
    return { ok: false, reason: "NOT_FOUND" };
  }

  // Success!
  console.log("[join] Society found:", {
    id: data.id,
    name: data.name,
    join_code: data.join_code,
  });

  return { ok: true, society: data as SocietyDoc };
}

/**
 * Find a society by its join code.
 * Returns the society doc if found, null if not found.
 * @deprecated Use lookupSocietyByJoinCode for better error handling
 */
export async function findSocietyByJoinCode(
  joinCode: string
): Promise<SocietyDoc | null> {
  const result = await lookupSocietyByJoinCode(joinCode);
  if (result.ok) {
    return result.society;
  }
  if (result.reason === "FORBIDDEN" || result.reason === "ERROR") {
    throw new Error(result.message || "Failed to find society");
  }
  return null;
}

/**
 * Regenerate join code for a society (Captain only)
 */
export async function regenerateJoinCode(societyId: string): Promise<string> {
  const newCode = generateJoinCode();
  await updateSocietyDoc(societyId, { join_code: newCode });
  return newCode;
}
