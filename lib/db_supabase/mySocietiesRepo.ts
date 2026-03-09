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
