/**
 * Tee sheet editor — player pool filter logic (paid / kind / society / search).
 */

import type { EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventAttendeeRow } from "@/lib/jointEventSignups";
import { memberGuestKindFromAttendeeRow } from "@/lib/eventAttendeeCsv";

export type PlayerPoolItem = {
  key: string;
  id: string;
  name: string;
  kind: "member" | "guest";
  paid: boolean;
  anyUnpaid: boolean;
  societyIds: string[];
  societyLabels: string[];
  member?: MemberDoc;
  guest?: EventGuest;
};

export type PlayerPoolFilterState = {
  paidOnly: boolean;
  unpaidOnly: boolean;
  membersOnly: boolean;
  guestsOnly: boolean;
  /** Society id or "all". */
  societyId: string;
  searchQuery: string;
};

export const DEFAULT_PLAYER_POOL_FILTERS: PlayerPoolFilterState = {
  paidOnly: false,
  unpaidOnly: false,
  membersOnly: false,
  guestsOnly: false,
  societyId: "all",
  searchQuery: "",
};

function representativeMemberId(row: JointEventAttendeeRow): string | null {
  const reg = row.registrations[0];
  return reg ? String(reg.member_id) : null;
}

export function playerPoolItemFromAttendeeRow(
  row: JointEventAttendeeRow,
  membersById: Map<string, MemberDoc>,
  guestsById: Map<string, EventGuest>,
): PlayerPoolItem | null {
  const kindLabel = memberGuestKindFromAttendeeRow(row);
  const kind = kindLabel === "Guest" ? ("guest" as const) : ("member" as const);
  const mid = representativeMemberId(row);
  const guest = row.guestId ? guestsById.get(String(row.guestId)) : undefined;
  const member = mid ? membersById.get(mid) : undefined;

  const id =
    kind === "guest" && row.guestId
      ? String(row.guestId)
      : mid ?? row.key;

  if (!id) return null;

  const allPaid = row.sources.length > 0 && row.sources.every((s) => s.paid);
  const anyUnpaid = row.sources.some((s) => !s.paid);
  const societyIds = [...new Set(row.sources.map((s) => s.societyId).filter(Boolean))];
  const societyLabels = [...new Set(row.sources.map((s) => s.societyName).filter(Boolean))];

  return {
    key: row.key,
    id,
    name: row.displayName.trim() || (kind === "guest" ? "Guest" : "Member"),
    kind,
    paid: allPaid,
    anyUnpaid,
    societyIds,
    societyLabels,
    member,
    guest,
  };
}

export function buildPlayerPoolItems(
  attendeeRows: JointEventAttendeeRow[],
  membersById: Map<string, MemberDoc>,
  guestsById: Map<string, EventGuest>,
): PlayerPoolItem[] {
  const out: PlayerPoolItem[] = [];
  for (const row of attendeeRows) {
    const item = playerPoolItemFromAttendeeRow(row, membersById, guestsById);
    if (item) out.push(item);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function filterPlayerPoolItems(
  items: PlayerPoolItem[],
  filters: PlayerPoolFilterState,
): PlayerPoolItem[] {
  const q = filters.searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.paidOnly && !item.paid) return false;
    if (filters.unpaidOnly && !item.anyUnpaid) return false;
    if (filters.membersOnly && !filters.guestsOnly && item.kind !== "member") return false;
    if (filters.guestsOnly && !filters.membersOnly && item.kind !== "guest") return false;
    if (filters.societyId !== "all" && !item.societyIds.includes(filters.societyId)) return false;
    if (q && !item.name.toLowerCase().includes(q)) return false;
    return true;
  });
}
