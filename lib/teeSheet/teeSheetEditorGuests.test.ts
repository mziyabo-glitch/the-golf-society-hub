import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/db_supabase/jointEventRepo", () => ({ getJointEventTeeSheet: vi.fn() }));
vi.mock("@/lib/db_supabase/eventRegistrationRepo", () => ({
  getEventRegistrations: vi.fn(),
  scopeEventRegistrations: vi.fn((regs: unknown[]) => regs),
}));
import {
  editorGuestPlayerFromDoc,
  ensurePaidGuestsInEditorGroups,
  hydrateEditorGroupsWithPaidGuests,
  type EditorGuestPlayer,
} from "@/lib/teeSheet/teeSheetEditorGuests";
import { guestPlayerId } from "@/lib/teeSheetEligibility";

type TestGuest = {
  id: string;
  society_id: string;
  event_id: string;
  name: string;
  attendee_type: "guest";
  sex: "male" | "female" | null;
  handicap_index: number | null;
  paid: boolean;
  created_at: string;
  updated_at: string;
};

const paidFred: TestGuest = {
  id: "fred-uuid",
  society_id: "soc1",
  event_id: "ev1",
  name: "Fred Cuthbertson",
  attendee_type: "guest",
  sex: "male",
  handicap_index: 14.2,
  paid: true,
  created_at: "",
  updated_at: "",
};

const unpaidGuest: TestGuest = {
  ...paidFred,
  id: "unpaid-uuid",
  name: "Unpaid Guest",
  paid: false,
};

describe("teeSheetEditorGuests", () => {
  it("adds paid guest not in initial generator pool to empty groups", () => {
    const out = ensurePaidGuestsInEditorGroups<{ groupNumber: number; players: EditorGuestPlayer[] }>(
      [],
      [paidFred],
    );
    expect(out).toHaveLength(1);
    expect(out[0].players.map((p) => p.id)).toEqual([guestPlayerId("fred-uuid")]);
    expect(out[0].players[0].name).toBe("Fred Cuthbertson");
  });

  it("adds paid guest to first group when members already assigned", () => {
    const out = ensurePaidGuestsInEditorGroups(
      [{ groupNumber: 1, players: [{ id: "member-a", name: "Alice", handicapIndex: 10, gender: "male" }] }],
      [paidFred],
    );
    expect(out[0].players.map((p) => p.id)).toEqual(["member-a", guestPlayerId("fred-uuid")]);
  });

  it("does not add unpaid guests", () => {
    const out = ensurePaidGuestsInEditorGroups([], [unpaidGuest]);
    expect(out).toEqual([]);
  });

  it("hydrates saved guest-* tee_group_players then adds newly paid guests", () => {
    const out = hydrateEditorGroupsWithPaidGuests(
      [{ groupNumber: 1, players: [{ id: "member-a", name: "Alice", handicapIndex: 10, gender: "male" }] }],
      [paidFred, unpaidGuest],
      [
        {
          id: "row1",
          event_id: "ev1",
          group_number: 2,
          position: 0,
          player_id: guestPlayerId("fred-uuid"),
        },
      ],
    );
    const ids = out.flatMap((g) => g.players.map((p) => p.id));
    expect(ids).toContain(guestPlayerId("fred-uuid"));
    expect(ids).not.toContain(guestPlayerId("unpaid-uuid"));
    expect(out.some((g) => g.groupNumber === 2)).toBe(true);
  });

  it("editorGuestPlayerFromDoc uses guest-{uuid} id", () => {
    expect(editorGuestPlayerFromDoc(paidFred).id).toBe(guestPlayerId("fred-uuid"));
  });
});
