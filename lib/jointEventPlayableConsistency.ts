/**
 * Joint playable pipeline: `event_entries.player_id` is the society-scoped source of truth for
 * tee sheet, Points, and related UIs. Compare against `event_registrations` (in + paid) using
 * **per–member-id** matching so representative-id collapse cannot hide drift.
 */

import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import { isTeeSheetEligible } from "@/lib/db_supabase/eventRegistrationRepo";
import type { JointEventEntry } from "@/lib/db_supabase/jointEventTypes";

function entryPlayerIdSet(entries: Pick<JointEventEntry, "player_id">[]): Set<string> {
  return new Set(entries.map((e) => String(e.player_id)).filter(Boolean));
}

export type JointPlayableGap = {
  memberId: string;
  societyId: string;
};

/**
 * Eligible (in + paid) registrations in participating societies with no `event_entries` row whose
 * `player_id` equals that registration's `member_id`. Does not treat “same person” clusters as
 * equivalent — dual members need one `event_entries` row per society member id.
 */
export function findEligibleRegistrationsMissingPlayableEntry(
  registrations: EventRegistration[],
  entries: Pick<JointEventEntry, "player_id">[],
  participatingSocietyIds: string[],
): JointPlayableGap[] {
  const societySet = new Set(participatingSocietyIds.filter(Boolean));
  const entryIds = entryPlayerIdSet(entries);
  const gaps: JointPlayableGap[] = [];

  for (const r of registrations) {
    if (!isTeeSheetEligible(r)) continue;
    if (!societySet.has(r.society_id)) continue;
    if (entryIds.has(String(r.member_id))) continue;
    gaps.push({ memberId: String(r.member_id), societyId: String(r.society_id) });
  }
  return gaps;
}

/** Dev-only: log when eligible registrations lack a matching `event_entries.player_id` for that member id. */
export function logJointPlayableConsistencyDev(params: {
  eventId: string;
  registrations: EventRegistration[];
  entries: Pick<JointEventEntry, "player_id">[];
  participatingSocietyIds: string[];
}): void {
  if (!__DEV__) return;
  const gaps = findEligibleRegistrationsMissingPlayableEntry(
    params.registrations,
    params.entries,
    params.participatingSocietyIds,
  );
  if (gaps.length === 0) return;
  console.warn("[joint-consistency] eligible event_registrations missing event_entries row for society member id", {
    eventId: params.eventId,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 25),
  });
}

/** Short admin copy for Players (joint) when gaps exist. */
export function formatJointPlayableGapWarning(gaps: JointPlayableGap[]): string | null {
  if (gaps.length === 0) return null;
  const n = gaps.length;
  return (
    `${n} confirmed player${n === 1 ? "" : "s"} (paid, RSVP in) ${n === 1 ? "has" : "have"} no ` +
    `event_entries row for their society-specific member id. Society-scoped scoring may omit them until ` +
    `Players is saved or the tee sheet is saved/published (dual members need one entry per participating society).`
  );
}
