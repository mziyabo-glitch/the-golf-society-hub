/**
 * OOM Champions (Roll of Honour) - repository
 * CRUD and photo upload for society OOM champions by season
 */

import { supabase } from "@/lib/supabase";

export const OOM_CHAMPIONS_BUCKET = "oom-champions";

export type OomChampionDoc = {
  id: string;
  society_id: string;
  season_year: number;
  member_id: string;
  bio: string | null;
  photo_url: string | null;
  points_total: number | null;
  created_at?: string;
  updated_at?: string;
  // Joined from members
  member_name?: string;
  member_display_name?: string;
};

export type OomChampionInput = {
  season_year: number;
  member_id: string;
  bio?: string | null;
  photo_url?: string | null;
  points_total?: number | null;
};

/**
 * List all OOM champions for a society, ordered by year descending
 */
export async function getOomChampionsBySociety(
  societyId: string
): Promise<OomChampionDoc[]> {
  const { data, error } = await supabase
    .from("oom_champions")
    .select("id, society_id, season_year, member_id, bio, photo_url, points_total, created_at, updated_at")
    .eq("society_id", societyId)
    .order("season_year", { ascending: false });

  if (error) {
    console.error("[oomChampionsRepo] getOomChampionsBySociety error:", error);
    throw new Error(error.message || "Failed to load champions");
  }

  const rows = data || [];
  if (rows.length === 0) return [];

  const memberIds = [...new Set(rows.map((r: any) => r.member_id))];
  const { data: membersData } = await supabase
    .from("members")
    .select("id, name, display_name")
    .in("id", memberIds);

  const memberMap = new Map<string, { name?: string; display_name?: string }>();
  (membersData || []).forEach((m: any) => {
    memberMap.set(m.id, { name: m.name, display_name: m.display_name });
  });

  return rows.map((row: any) => {
    const m = memberMap.get(row.member_id);
    return {
      id: row.id,
      society_id: row.society_id,
      season_year: row.season_year,
      member_id: row.member_id,
      bio: row.bio ?? null,
      photo_url: row.photo_url ?? null,
      points_total: row.points_total ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      member_name: m?.name ?? undefined,
      member_display_name: m?.display_name ?? m?.name ?? undefined,
    };
  });
}

/**
 * Get a single champion by ID
 */
export async function getOomChampionById(
  id: string
): Promise<OomChampionDoc | null> {
  const { data, error } = await supabase
    .from("oom_champions")
    .select("id, society_id, season_year, member_id, bio, photo_url, points_total, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[oomChampionsRepo] getOomChampionById error:", error);
    throw new Error(error.message || "Failed to load champion");
  }

  if (!data) return null;

  const { data: memberData } = await supabase
    .from("members")
    .select("name, display_name")
    .eq("id", data.member_id)
    .maybeSingle();

  return {
    id: data.id,
    society_id: data.society_id,
    season_year: data.season_year,
    member_id: data.member_id,
    bio: data.bio ?? null,
    photo_url: data.photo_url ?? null,
    points_total: data.points_total ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    member_name: (memberData as any)?.name ?? null,
    member_display_name: (memberData as any)?.display_name ?? (memberData as any)?.name ?? null,
  };
}

/**
 * Get champion by society and year (for edit form)
 */
export async function getOomChampionBySocietyAndYear(
  societyId: string,
  seasonYear: number
): Promise<OomChampionDoc | null> {
  const { data, error } = await supabase
    .from("oom_champions")
    .select("id, society_id, season_year, member_id, bio, photo_url, points_total, created_at, updated_at")
    .eq("society_id", societyId)
    .eq("season_year", seasonYear)
    .maybeSingle();

  if (error || !data) return null;

  const { data: memberData } = await supabase
    .from("members")
    .select("name, display_name")
    .eq("id", data.member_id)
    .maybeSingle();

  return {
    id: data.id,
    society_id: data.society_id,
    season_year: data.season_year,
    member_id: data.member_id,
    bio: data.bio ?? null,
    photo_url: data.photo_url ?? null,
    points_total: data.points_total ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
    member_name: (memberData as any)?.name ?? null,
    member_display_name: (memberData as any)?.display_name ?? (memberData as any)?.name ?? null,
  };
}

/**
 * Create a new OOM champion
 */
export async function createOomChampion(
  societyId: string,
  input: OomChampionInput
): Promise<OomChampionDoc> {
  const { data, error } = await supabase
    .from("oom_champions")
    .insert({
      society_id: societyId,
      season_year: input.season_year,
      member_id: input.member_id,
      bio: input.bio ?? null,
      photo_url: input.photo_url ?? null,
      points_total: input.points_total ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[oomChampionsRepo] createOomChampion error:", error);
    if (error.code === "23505") {
      throw new Error(`A champion for ${input.season_year} already exists.`);
    }
    throw new Error(error.message || "Failed to create champion");
  }

  return data as OomChampionDoc;
}

/**
 * Update an existing OOM champion
 */
export async function updateOomChampion(
  id: string,
  input: Partial<OomChampionInput>
): Promise<void> {
  const { error } = await supabase
    .from("oom_champions")
    .update({
      ...(input.season_year !== undefined && { season_year: input.season_year }),
      ...(input.member_id !== undefined && { member_id: input.member_id }),
      ...(input.bio !== undefined && { bio: input.bio }),
      ...(input.photo_url !== undefined && { photo_url: input.photo_url }),
      ...(input.points_total !== undefined && { points_total: input.points_total }),
    })
    .eq("id", id);

  if (error) {
    console.error("[oomChampionsRepo] updateOomChampion error:", error);
    throw new Error(error.message || "Failed to update champion");
  }
}

/**
 * Delete an OOM champion
 */
export async function deleteOomChampion(id: string): Promise<void> {
  const { error } = await supabase.from("oom_champions").delete().eq("id", id);

  if (error) {
    console.error("[oomChampionsRepo] deleteOomChampion error:", error);
    throw new Error(error.message || "Failed to delete champion");
  }
}

/**
 * Upload champion photo to Supabase Storage
 * Path: societies/{society_id}/oom/{champion_id}.{ext}
 */
export async function uploadChampionPhoto(
  societyId: string,
  championId: string,
  file: { uri: string; type?: string; name?: string }
): Promise<{ publicUrl: string }> {
  const ext = file.name?.match(/\.(jpe?g|png|gif|webp)$/i)?.[1] ?? "jpg";
  const path = `societies/${societyId}/oom/${championId}.${ext}`;

  const response = await fetch(file.uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(OOM_CHAMPIONS_BUCKET)
    .upload(path, blob, {
      contentType: file.type || `image/${ext}`,
      upsert: true,
    });

  if (error) {
    console.error("[oomChampionsRepo] uploadChampionPhoto error:", error);
    throw new Error(error.message || "Failed to upload photo");
  }

  const { data: urlData } = supabase.storage
    .from(OOM_CHAMPIONS_BUCKET)
    .getPublicUrl(path);

  const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;
  return { publicUrl };
}
