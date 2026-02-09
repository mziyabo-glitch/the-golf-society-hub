// lib/db_supabase/societyRepo.ts
import { supabase } from "@/lib/supabase";
import { SOCIETY_LOGO_BUCKET, clearSocietyLogoCache } from "@/lib/societyLogo";

export type SocietyDoc = {
  id: string;
  name: string;
  country?: string;
  join_code?: string;
  joinCode?: string; // camelCase alias
  created_at?: string;
  created_by?: string;
  home_course_id?: string | null;
  home_course?: string | null;
  scoring_mode?: string | null;
  handicap_rule?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null; // camelCase alias
  admin_pin?: string;
  annual_fee?: number;
  annual_fee_pence?: number | null; // Annual membership fee in pence
  annualFeePence?: number | null; // camelCase alias
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
    .update(updates)
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

/**
 * Reset all society data — clears members, events, results, and finance entries.
 * Keeps the society itself (name, join code, settings) intact.
 */
export async function resetSocietyData(societyId: string): Promise<void> {
  // 1) Delete event_results (references events, so delete first)
  const { error: rErr } = await supabase
    .from("event_results")
    .delete()
    .eq("society_id", societyId);
  if (rErr) throw new Error(rErr.message);

  // 2) Delete finance entries
  const { error: fErr } = await supabase
    .from("finance_entries")
    .delete()
    .eq("society_id", societyId);
  if (fErr) throw new Error(fErr.message);

  // 3) Delete events
  const { error: eErr } = await supabase
    .from("events")
    .delete()
    .eq("society_id", societyId);
  if (eErr) throw new Error(eErr.message);

  // 4) Delete members
  const { error: mErr } = await supabase
    .from("members")
    .delete()
    .eq("society_id", societyId);
  if (mErr) throw new Error(mErr.message);

  // 5) Reset opening balance to 0
  const { error: sErr } = await supabase
    .from("societies")
    .update({ opening_balance_pence: 0 })
    .eq("id", societyId);
  if (sErr) throw new Error(sErr.message);
}

// =====================================================
// LOGO MANAGEMENT
// =====================================================

const LOGO_BUCKET = SOCIETY_LOGO_BUCKET;
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export type LogoUploadResult = {
  success: boolean;
  logoUrl?: string;
  error?: string;
};

/**
 * Validate logo file before upload
 */
function validateLogoFile(
  file: { uri: string; type?: string; size?: number; name?: string }
): string | null {
  // Check file size if available
  if (file.size && file.size > MAX_LOGO_SIZE_BYTES) {
    return `Logo must be smaller than ${MAX_LOGO_SIZE_BYTES / 1024 / 1024}MB`;
  }

  // Check file type if available
  if (file.type && !ALLOWED_LOGO_TYPES.includes(file.type)) {
    return "Logo must be a JPEG, PNG, GIF, or WebP image";
  }

  return null;
}

function mapLogoStorageError(error: any): string | null {
  const message = (error?.message ?? "").toString().toLowerCase();
  const status = error?.statusCode ?? error?.status;

  if ((message.includes("bucket") && message.includes("not found")) || status === 404) {
    return `Storage isn't configured - create bucket '${LOGO_BUCKET}' in Supabase.`;
  }

  if (
    status === 400 ||
    status === "400" ||
    status === 401 ||
    status === 403 ||
    message.length === 0 ||
    message.includes("permission") ||
    message.includes("policy") ||
    message.includes("not allowed") ||
    message.includes("row-level security") ||
    message.includes("violates")
  ) {
    return "You don't have permission to upload the logo. Captain only.";
  }

  return null;
}

/**
 * Get file extension from mime type or filename
 */
function getExtension(mimeType?: string, fileName?: string): string {
  if (mimeType) {
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
    };
    if (extensions[mimeType]) return extensions[mimeType];
  }

  if (fileName) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }

  return "jpg"; // Default
}

/**
 * Upload society logo to Supabase Storage
 * Path format: {societyId}/logo.{ext}
 *
 * @param societyId - Society to upload logo for
 * @param file - File object with uri, type, size, name
 * @returns Upload result with success status and public URL
 */
export async function uploadSocietyLogo(
  societyId: string,
  file: { uri: string; type?: string; size?: number; name?: string }
): Promise<LogoUploadResult> {
  console.log("[societyRepo] uploadSocietyLogo:", {
    societyId,
    bucket: LOGO_BUCKET,
    file: { ...file, uri: file.uri.substring(0, 50) + "..." },
  });

  // Validate file
  const validationError = validateLogoFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    // Get file extension
    const ext = getExtension(file.type, file.name);
    const filePath = `${societyId}/logo.${ext}`;

    console.log("[societyRepo] Uploading to bucket:", LOGO_BUCKET, "path:", filePath);

    // Fetch the file as blob for upload
    const response = await fetch(file.uri);
    const blob = await response.blob();

    // Check blob size as fallback validation
    if (blob.size > MAX_LOGO_SIZE_BYTES) {
      return { success: false, error: `Logo must be smaller than ${MAX_LOGO_SIZE_BYTES / 1024 / 1024}MB` };
    }

    // Delete existing logo first (if any) - ignore errors
    await supabase.storage.from(LOGO_BUCKET).remove([`${societyId}/logo.jpg`, `${societyId}/logo.png`, `${societyId}/logo.gif`, `${societyId}/logo.webp`]);

    // Upload new logo
    const { data, error } = await supabase.storage
      .from(LOGO_BUCKET)
      .upload(filePath, blob, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });

    if (error) {
      // Log full error object for debugging
      console.error("[societyRepo] uploadSocietyLogo storage error:", {
        message: error.message,
        name: error.name,
        statusCode: (error as any).statusCode,
        error: (error as any).error,
        bucket: LOGO_BUCKET,
        fullError: JSON.stringify(error),
      });

      const friendly = mapLogoStorageError(error);
      if (friendly) {
        return { success: false, error: friendly };
      }

      return { success: false, error: error.message || "Failed to upload logo." };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(LOGO_BUCKET)
      .getPublicUrl(filePath);

    const logoUrl = urlData?.publicUrl;
    if (!logoUrl) {
      return { success: false, error: "Failed to get logo URL" };
    }

    // Add cache-busting parameter
    const logoUrlWithCache = `${logoUrl}?v=${Date.now()}`;

    // Update society record with new logo URL
    await updateSocietyDoc(societyId, { logo_url: logoUrlWithCache });
    clearSocietyLogoCache(societyId);

    console.log("[societyRepo] uploadSocietyLogo success:", logoUrlWithCache);
    return { success: true, logoUrl: logoUrlWithCache };

  } catch (e: any) {
    console.error("[societyRepo] uploadSocietyLogo error:", {
      message: e?.message,
      bucket: LOGO_BUCKET,
    });

    const friendly = mapLogoStorageError(e);
    if (friendly) {
      return { success: false, error: friendly };
    }

    return { success: false, error: e?.message || "Failed to upload logo." };
  }
}

/**
 * Remove society logo
 * Deletes from storage and clears logo_url in database
 *
 * @param societyId - Society to remove logo from
 */
export async function removeSocietyLogo(societyId: string): Promise<LogoUploadResult> {
  console.log("[societyRepo] removeSocietyLogo:", { societyId, bucket: LOGO_BUCKET });

  try {
    // Remove all possible logo files
    const { error } = await supabase.storage
      .from(LOGO_BUCKET)
      .remove([
        `${societyId}/logo.jpg`,
        `${societyId}/logo.png`,
        `${societyId}/logo.gif`,
        `${societyId}/logo.webp`,
      ]);

    if (error) {
      console.warn("[societyRepo] removeSocietyLogo storage warning:", {
        message: error.message,
        bucket: LOGO_BUCKET,
      });
      const friendly = mapLogoStorageError(error);
      if (friendly) {
        return { success: false, error: friendly };
      }
      // Continue anyway - file might not exist, bucket might not exist yet
    }

    // Clear logo_url in database
    await updateSocietyDoc(societyId, { logo_url: null });
    clearSocietyLogoCache(societyId);

    console.log("[societyRepo] removeSocietyLogo success");
    return { success: true };

  } catch (e: any) {
    console.error("[societyRepo] removeSocietyLogo error:", {
      message: e?.message,
      bucket: LOGO_BUCKET,
    });
    const friendly = mapLogoStorageError(e);
    if (friendly) {
      return { success: false, error: friendly };
    }

    return { success: false, error: e?.message || "Failed to remove logo." };
  }
}

// =====================================================
// CONVENIENCE ALIASES
// =====================================================

/**
 * Get a society by ID (alias for getSocietyDoc with mapping)
 */
export async function getSociety(societyId: string): Promise<SocietyDoc | null> {
  const data = await getSocietyDoc(societyId);
  if (!data) return null;

  // Add camelCase aliases
  return {
    ...data,
    joinCode: data.join_code,
    logoUrl: data.logo_url,
    annualFeePence: data.annual_fee_pence ?? null,
  };
}

/**
 * Update a society (with support for finance fields)
 * Only Captain or Treasurer can update finance fields (enforced by RLS)
 *
 * @param societyId - The society to update
 * @param updates - Fields to update
 */
export async function updateSociety(
  societyId: string,
  updates: Partial<{
    name: string;
    country: string;
    home_course_id: string | null;
    home_course: string | null;
    scoring_mode: string | null;
    handicap_rule: string | null;
    annual_fee_pence: number | null;
  }>
): Promise<void> {
  console.log("[societyRepo] updateSociety:", { societyId, updates });

  const { error } = await supabase
    .from("societies")
    .update(updates)
    .eq("id", societyId);

  if (error) {
    console.error("[societyRepo] updateSociety failed:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });

    // Handle RLS permission errors
    if (error.code === "42501" || error.message?.includes("row-level security")) {
      throw new Error("Only Captain or Treasurer can update society settings.");
    }

    throw new Error(error.message || "Failed to update society");
  }
}
