/**
 * Build society-scoped OOM eligibility for gross-score publish → `event_results`.
 */

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventEntry, JointEventSociety } from "@/lib/db_supabase/jointEventTypes";
import {
  activeSocietyRunsOom,
  isJointEntryEligibleForSocietyOom,
} from "@/lib/oomJointField";
import { isGuestEntrantKey } from "@/lib/oomMemberOnlyScoring";

export type PublishOomEligibilityResolver = (playerId: string) => boolean;

export function buildPublishOomEligibilityResolver(params: {
  activeSocietyId: string;
  participatingSocieties: readonly JointEventSociety[];
  jointEntries: readonly JointEventEntry[];
  membersById: Map<string, MemberDoc>;
}): PublishOomEligibilityResolver {
  const { activeSocietyId, participatingSocieties, jointEntries, membersById } = params;
  const jointEntryByPlayerId = new Map(jointEntries.map((e) => [e.player_id, e]));
  const societyRunsOom = activeSocietyRunsOom(participatingSocieties, activeSocietyId);

  return (playerId: string) => {
    if (isGuestEntrantKey(playerId)) return false;
    if (!societyRunsOom) return false;
    const member = membersById.get(playerId);
    if (member?.society_id && String(member.society_id) !== String(activeSocietyId)) {
      return false;
    }
    const entry = jointEntryByPlayerId.get(playerId);
    return isJointEntryEligibleForSocietyOom(entry, activeSocietyId);
  };
}
