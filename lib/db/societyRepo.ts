import { supabase, requireSupabaseSession } from "@/lib/supabase";

export type SocietyDoc = {
  id: string;
  name: string;
  country?: string | null;
  joinCode?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  homeCourseId?: string | null;
  homeCourse?: string | null;
  scoringMode?: string | null;
  handicapRule?: string | null;
  logoUrl?: string | null;
  adminPin?: string | null;
  annualFee?: number | null;
};

type SocietyInput = {
  name: string;
  country?: string;
  created_by?: string;
  createdBy?: string;
};

function mapSociety(row: any): SocietyDoc {
  return {
    id: row.id,
    name: row.name,
    country: row.country ?? null,
    joinCode: row.join_code ?? row.joinCode ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    homeCourseId: row.home_course_id ?? null,
    homeCourse: row.home_course ?? null,
    scoringMode: row.scoring_mode ?? null,
    handicapRule: row.handicap_rule ?? null,
    logoUrl: row.logo_url ?? null,
    adminPin: row.admin_pin ?? null,
    annualFee: row.annual_fee ?? null,
  };
}

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
  await requireSupabaseSession("societyRepo.createSociety");
  const createdBy = input.created_by ?? input.createdBy;
  if (!createdBy) {
    throw new Error("createSociety: missing created_by");
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) {
    throw new Error(authError.message || "Authentication error");
  }

  if (!authData?.user) {
    throw new Error("You must be signed in to create a society.");
  }

  if (authData.user.id !== createdBy) {
    throw new Error("Authentication mismatch. Please refresh and try again.");
  }

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    created_by: createdBy,
  };

  if (input.country?.trim()) {
    payload.country = input.country.trim();
  }

  const { data, error } = await supabase
    .from("societies")
    .insert(payload)
    .select(
      "id, name, country, join_code, created_by, created_at, updated_at, home_course_id, home_course, scoring_mode, handicap_rule, logo_url, admin_pin, annual_fee"
    )
    .single();

  if (error) {
    throw new Error(error.message || "Failed to create society");
  }

  return mapSociety(data);
}

export async function getSocietyDoc(id: string): Promise<SocietyDoc | null> {
  await requireSupabaseSession("societyRepo.getSocietyDoc");
  const { data, error } = await supabase
    .from("societies")
    .select(
      "id, name, country, join_code, created_by, created_at, updated_at, home_course_id, home_course, scoring_mode, handicap_rule, logo_url, admin_pin, annual_fee"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to get society");
  }
  return data ? mapSociety(data) : null;
}

export async function getSocietyByCode(joinCode: string): Promise<SocietyDoc | null> {
  await requireSupabaseSession("societyRepo.getSocietyByCode");
  const normalizedCode = joinCode.trim().toUpperCase();
  if (!normalizedCode || normalizedCode.length < 4) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_society_by_code", {
    p_join_code: normalizedCode,
  });

  if (error) {
    throw new Error(error.message || "Failed to find society by code");
  }
  return data ? mapSociety(data) : null;
}

/**
 * Backwards-compatible alias
 */
export async function findSocietyByJoinCode(joinCode: string): Promise<SocietyDoc | null> {
  return getSocietyByCode(joinCode);
}

export function subscribeSocietyDoc(
  id: string,
  onChange: (society: SocietyDoc | null) => void,
  onError?: (error: Error) => void
): () => void {
  let active = true;

  const fetchOnce = async () => {
    try {
      const doc = await getSocietyDoc(id);
      if (active) onChange(doc);
    } catch (error: any) {
      if (active && onError) onError(error);
    }
  };

  fetchOnce();
  const timer = setInterval(fetchOnce, 5000);

  return () => {
    active = false;
    clearInterval(timer);
  };
}

export async function updateSocietyDoc(id: string, updates: Partial<SocietyDoc>): Promise<void> {
  await requireSupabaseSession("societyRepo.updateSocietyDoc");
  const payload: Record<string, unknown> = {};

  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.country !== undefined) payload.country = updates.country;
  if (updates.homeCourseId !== undefined) payload.home_course_id = updates.homeCourseId;
  if (updates.homeCourse !== undefined) payload.home_course = updates.homeCourse;
  if (updates.scoringMode !== undefined) payload.scoring_mode = updates.scoringMode;
  if (updates.handicapRule !== undefined) payload.handicap_rule = updates.handicapRule;
  if (updates.logoUrl !== undefined) payload.logo_url = updates.logoUrl;
  if (updates.adminPin !== undefined) payload.admin_pin = updates.adminPin;
  if (updates.annualFee !== undefined) payload.annual_fee = updates.annualFee;
  if (updates.joinCode !== undefined) payload.join_code = updates.joinCode;

  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("societies").update(payload).eq("id", id);

  if (error) {
    throw new Error(error.message || "Failed to update society");
  }
}

/**
 * Regenerate join code for a society (Captain only)
 */
export async function regenerateJoinCode(societyId: string): Promise<string> {
  const newCode = generateJoinCode();
  await updateSocietyDoc(societyId, { joinCode: newCode });
  return newCode;
}
