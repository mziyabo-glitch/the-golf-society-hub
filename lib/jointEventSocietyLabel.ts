/**
 * Joint events: resolve a stable society display label from `society_id` + participating
 * societies (never use email for identity). Same email across societies ⇒ different
 * `member_id` + `society_id` rows — always show society from the member/registration row.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventEntry } from "@/lib/db_supabase/jointEventTypes";

export type ParticipatingSocietyRef = {
  society_id: string;
  society_name?: string | null;
};

/** Map event `society_id` → display name for badges / subtitles. */
export function buildSocietyIdToNameMap(
  participating: ParticipatingSocietyRef[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const s of participating) {
    if (!s?.society_id) continue;
    const label = (s.society_name?.trim() || s.society_id) as string;
    m.set(s.society_id, label);
  }
  return m;
}

export function societyLabelFromMember(
  member: MemberDoc | null | undefined,
  societyIdToName: Map<string, string>,
): string | null {
  if (!member?.society_id) return null;
  return societyIdToName.get(member.society_id) ?? member.society_id;
}

export function societyLabelFromSocietyId(
  societyId: string | undefined | null,
  societyIdToName: Map<string, string>,
): string | null {
  if (!societyId) return null;
  return societyIdToName.get(societyId) ?? societyId;
}

/**
 * Prefer hydrated `MemberDoc.society_id` (authoritative for that membership row).
 * Else use RPC `eligibility[].society_id` or `society_memberships` strings as fallback.
 */
export function jointSocietyLineForEntry(
  entry: JointEventEntry,
  member: MemberDoc | undefined,
  societyIdToName: Map<string, string>,
): string {
  const fromMember = societyLabelFromMember(member, societyIdToName);
  if (fromMember) return fromMember;

  const eligIds = entry.eligibility?.map((e) => e.society_id).filter(Boolean) ?? [];
  if (eligIds.length > 0) {
    const labels = [...new Set(eligIds.map((id) => societyIdToName.get(id) ?? id))];
    return labels.join(" · ");
  }

  if (entry.society_memberships?.length) {
    return entry.society_memberships.map((x) => x.trim()).filter(Boolean).join(" · ");
  }

  return "Society unknown";
}
