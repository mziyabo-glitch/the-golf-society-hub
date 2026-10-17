import type { MemberDoc } from "@/lib/db_supabase/memberRepo";

export type RegistrationMemberFields = {
  member_id: string;
  society_id: string;
  user_id?: string | null;
  member_email?: string | null;
  member_name?: string | null;
  member_display_name?: string | null;
};

/** RPC `get_joint_event_member_visibility` returns `member_id`; table rows use `id`. */
export function normalizeMemberDocId(
  row: Pick<MemberDoc, "id"> & { member_id?: string | null },
): string {
  const fromId = String(row.id ?? "").trim();
  if (fromId) return fromId;
  return String(row.member_id ?? "").trim();
}

/** Minimal member row from joint registration RPC (cross-society tee-sheet hydration). */
export function memberDocFromRegistrationRow(r: RegistrationMemberFields): MemberDoc {
  const mid = String(r.member_id ?? "").trim();
  return {
    id: mid,
    society_id: String(r.society_id ?? ""),
    user_id: r.user_id ?? null,
    email: r.member_email ?? undefined,
    name: r.member_name ?? undefined,
    display_name: r.member_display_name ?? undefined,
    displayName: r.member_display_name ?? r.member_name ?? undefined,
  };
}
