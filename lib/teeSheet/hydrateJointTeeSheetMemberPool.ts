import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  memberDocFromRegistrationRow,
  normalizeMemberDocId,
} from "@/lib/memberDocUtils";

export type HydrateJointTeeSheetMemberPoolOpts = {
  candidateMemberIds: string[];
  pooledMembers: MemberDoc[];
  registrations: EventRegistration[];
  fetchMembersByIds?: (ids: string[]) => Promise<MemberDoc[]>;
};

/**
 * Build tee-sheet addable member rows for a joint event.
 * Candidate ids may include cross-society paid players; RLS often blocks direct member SELECT.
 * Registration RPC stubs (migration 167) are the reliable fallback for missing MemberDoc rows.
 */
export async function hydrateJointTeeSheetMemberPool(
  opts: HydrateJointTeeSheetMemberPoolOpts,
): Promise<MemberDoc[]> {
  const memberById = new Map<string, MemberDoc>();

  for (const raw of opts.pooledMembers) {
    const id = normalizeMemberDocId(raw);
    if (!id) continue;
    memberById.set(id, {
      ...raw,
      id,
      displayName: raw.displayName ?? raw.display_name ?? raw.name,
    });
  }

  const missingMemberIds = opts.candidateMemberIds.filter((id) => !memberById.has(String(id)));
  if (missingMemberIds.length > 0 && opts.fetchMembersByIds) {
    const extra = await opts.fetchMembersByIds(missingMemberIds);
    for (const m of extra) {
      const id = normalizeMemberDocId(m);
      if (id) memberById.set(id, { ...m, id });
    }
  }

  for (const r of opts.registrations) {
    const mid = String(r.member_id ?? "").trim();
    if (!mid || memberById.has(mid)) continue;
    memberById.set(mid, memberDocFromRegistrationRow(r));
  }

  const candidateMembers = opts.candidateMemberIds
    .map((id) => memberById.get(String(id)))
    .filter((m): m is MemberDoc => !!m);

  const dropped = opts.candidateMemberIds.filter((id) => !memberById.has(String(id)));
  if (dropped.length > 0) {
    console.warn("[teeSheet] joint pool hydration dropped candidate ids", {
      droppedCount: dropped.length,
      droppedIds: dropped.slice(0, 12),
    });
  }

  return candidateMembers;
}
