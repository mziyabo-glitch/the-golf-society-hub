// lib/db_supabase/mySocietiesRepo.ts
// Fetches all societies the current user belongs to (multi-society support).

import { supabase } from "@/lib/supabase";

export type MySocietyMembership = {
  memberId: string;
  societyId: string;
  societyName: string;
  country: string | null;
  role: string;
  logoUrl: string | null;
  joinedAt: string;
};

/** Raw `members` rows for the signed-in user (debug: linkage, duplicates). */
export type MemberRowForAuthUser = {
  memberId: string;
  societyId: string;
  userId: string;
  createdAt: string | null;
};

/**
 * All `members` rows for the current auth user (`user_id` linkage).
 * Used to verify ZGS (or any society) membership vs `profiles.active_society_id`.
 */
export async function fetchMemberRowsForAuthUser(): Promise<MemberRowForAuthUser[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from("members")
    .select("id, society_id, user_id, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[mySocietiesRepo] fetchMemberRowsForAuthUser:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    memberId: String(row.id ?? ""),
    societyId: String(row.society_id ?? ""),
    userId: String(row.user_id ?? ""),
    createdAt: row.created_at != null ? String(row.created_at) : null,
  }));
}

/**
 * Fetch every society the current auth user belongs to,
 * joined with the society row for name/country/logo.
 */
export async function getMySocieties(): Promise<MySocietyMembership[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from("members")
    .select("id, society_id, role, created_at, societies(id, name, country, logo_url)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[mySocietiesRepo] getMySocieties:", error.message);
    return [];
  }

  return (data ?? []).map((row: any) => {
    const soc = row.societies;
    return {
      memberId: row.id,
      societyId: row.society_id,
      societyName: typeof soc?.name === "string" ? soc.name : "Society",
      country: soc?.country ?? null,
      role: row.role ?? "member",
      logoUrl: soc?.logo_url ?? null,
      joinedAt: row.created_at,
    };
  });
}

/**
 * Same as {@link getMySocieties}, but when `profiles.active_society_id` already points at a society,
 * retries briefly if that society is missing from the membership list.
 *
 * Post-join, `getMySocieties()` can briefly omit the new row (client/storage timing on iOS). Bootstrap
 * used to treat that as “stale active” and self-heal back to `memberships[0]` — the wrong society.
 */
export async function getMySocietiesEnsuringActive(
  profileActiveSocietyId: string | null | undefined,
): Promise<MySocietyMembership[]> {
  let list = await getMySocieties();
  const want = typeof profileActiveSocietyId === "string" ? profileActiveSocietyId.trim() : "";
  if (!want) return list;

  const contains = () => list.some((m) => m.societyId === want);
  if (contains()) return list;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return list;

  const delaysMs = [0, 80, 160, 240, 320, 450];
  for (const d of delaysMs) {
    if (d > 0) {
      await new Promise((r) => setTimeout(r, d));
    }
    list = await getMySocieties();
    if (contains()) return list;
  }

  const { data: direct, error: directErr } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", uid)
    .eq("society_id", want)
    .maybeSingle();

  if (directErr || !direct) {
    return list;
  }

  console.log("[mySocietiesRepo] getMySocietiesEnsuringActive: member row exists for active society but list still missing it — final refetch", {
    profileActiveSocietyId: want,
    listedCount: list.length,
  });
  await new Promise((r) => setTimeout(r, 350));
  list = await getMySocieties();
  return list;
}

/**
 * Fetch the member row for the current user in a specific society.
 */
export async function getMyMemberForSociety(societyId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("user_id", session.user.id)
    .eq("society_id", societyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[mySocietiesRepo] getMyMemberForSociety:", error.message);
    return null;
  }
  return data;
}
