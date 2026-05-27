import type { EventGuest } from "@/lib/db_supabase/eventGuestRepo";
import type { TeeGroupPlayerRow } from "@/lib/db_supabase/teeGroupsRepo";
import { guestPlayerId, parseGuestPlayerId } from "@/lib/teeSheetEligibility";

export type EditorGuestPlayer = {
  id: string;
  name: string;
  handicapIndex: number | null;
  gender: "male" | "female" | null;
};

export function editorGuestPlayerFromDoc(g: EventGuest): EditorGuestPlayer {
  return {
    id: guestPlayerId(g.id),
    name: g.name,
    handicapIndex: g.handicap_index ?? null,
    gender: g.sex ?? null,
  };
}

/** Add paid guests missing from the current editor groups (e.g. newly marked paid). */
export function ensurePaidGuestsInEditorGroups<
  T extends { groupNumber: number; players: EditorGuestPlayer[] },
>(groups: T[], paidGuests: EventGuest[]): T[] {
  const present = new Set(groups.flatMap((g) => g.players.map((p) => String(p.id))));
  const missing = paidGuests
    .filter((g) => !present.has(guestPlayerId(g.id)))
    .map(editorGuestPlayerFromDoc);
  if (missing.length === 0) return groups;

  if (groups.length === 0) {
    return [{ groupNumber: 1, players: missing }] as T[];
  }

  return groups.map((g, i) =>
    i === 0 ? { ...g, players: [...g.players, ...missing] } : g,
  ) as T[];
}

/** Hydrate guest-* rows saved on tee_group_players (joint events store members in event_entries). */
export function mergeGuestTeeAssignmentsIntoEditorGroups<
  T extends { groupNumber: number; players: EditorGuestPlayer[] },
>(groups: T[], assignments: TeeGroupPlayerRow[], guests: EventGuest[]): T[] {
  const guestsById = new Map(guests.map((g) => [String(g.id), g]));
  const byGroup = new Map(groups.map((g) => [g.groupNumber, { ...g, players: [...g.players] }]));

  for (const row of assignments) {
    const gid = parseGuestPlayerId(String(row.player_id));
    if (!gid) continue;
    const id = guestPlayerId(gid);
    const g = guestsById.get(gid);
    const player = editorGuestPlayerFromDoc(
      g ?? {
        id: gid,
        society_id: "",
        event_id: "",
        name: "Guest",
        attendee_type: "guest",
        sex: null,
        handicap_index: null,
        paid: true,
        created_at: "",
        updated_at: "",
      },
    );

    const gn = row.group_number;
    let group = byGroup.get(gn);
    if (!group) {
      group = { groupNumber: gn, players: [] } as T;
      byGroup.set(gn, group);
    }
    if (!group.players.some((p) => p.id === id)) {
      group.players.push(player);
    }
  }

  return [...byGroup.values()].sort((a, b) => a.groupNumber - b.groupNumber);
}
