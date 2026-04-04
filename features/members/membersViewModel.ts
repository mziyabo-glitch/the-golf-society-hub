import type { OrderOfMeritEntry } from "@/lib/db_supabase/resultsRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import { formatPoints, getRoleBadgesFromMember } from "./membersDomain";

/** Display row for Members list — no raw repo fields below this layer */
export type MemberListRowVm = {
  id: string;
  displayName: string;
  initials: string;
  email: string | null;
  hiLine: string | null;
  roleBadges: string[];
  isCurrentUser: boolean;
  hasLinkedApp: boolean;
  oom: { rank: number; pointsLabel: string } | null;
  annualFeePaid: boolean;
};

export function toMemberListRowVm(
  member: MemberDoc,
  oomEntry: OrderOfMeritEntry | undefined,
  currentMemberId: string | undefined,
): MemberListRowVm {
  const displayName = member.displayName || member.name || member.display_name || "Unknown";
  const hiVal = member.handicapIndex ?? member.handicap_index ?? null;
  const hiNum = hiVal != null ? Number(hiVal) : null;
  const hiLine =
    hiNum != null && Number.isFinite(hiNum) ? `HI ${hiNum.toFixed(1)}` : null;

  const badges = getRoleBadgesFromMember(member);

  return {
    id: member.id,
    displayName,
    initials: displayName.charAt(0).toUpperCase(),
    email: member.email?.trim() ? member.email : null,
    hiLine,
    roleBadges: badges,
    isCurrentUser: member.id === currentMemberId,
    hasLinkedApp: !!member.user_id,
    oom:
      oomEntry && oomEntry.totalPoints > 0
        ? {
            rank: oomEntry.rank,
            pointsLabel: `${formatPoints(oomEntry.totalPoints)} pts (${oomEntry.eventsPlayed} event${
              oomEntry.eventsPlayed !== 1 ? "s" : ""
            })`,
          }
        : null,
    annualFeePaid: !!member.paid,
  };
}
