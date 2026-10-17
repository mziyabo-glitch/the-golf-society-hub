import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);
import { loadCanonicalTeeSheet } from "@/lib/teeSheet/canonicalTeeSheet";
import { guestPlayerId } from "@/lib/teeSheetEligibility";

vi.mock("@/lib/db_supabase/eventRepo", () => ({
  getEvent: vi.fn(),
}));

vi.mock("@/lib/db_supabase/jointEventRepo", () => ({
  getJointEventDetail: vi.fn(),
  getJointEventTeeSheet: vi.fn(),
  getJointMetaForEventIds: vi.fn(),
  mapJointEventToEventDoc: vi.fn((e: unknown) => e),
}));

vi.mock("@/lib/db_supabase/teeGroupsRepo", () => ({
  getTeeGroups: vi.fn(),
  getTeeGroupPlayers: vi.fn(),
  teeTimeToDisplay: (t: string) => t.slice(0, 5),
}));

vi.mock("@/lib/db_supabase/eventRegistrationRepo", () => ({
  getEventRegistrations: vi.fn(),
  scopeEventRegistrations: vi.fn((regs: unknown[]) => regs),
  isTeeSheetEligible: (r: { status: string; paid: boolean }) => r.status === "in" && r.paid === true,
}));

vi.mock("@/lib/db_supabase/eventGuestRepo", () => ({
  getEventGuests: vi.fn(),
}));

vi.mock("@/lib/db_supabase/memberRepo", () => ({
  getMembersBySocietyId: vi.fn(),
  getMembersByIds: vi.fn().mockResolvedValue([]),
}));

import { getEvent } from "@/lib/db_supabase/eventRepo";
import { getJointMetaForEventIds } from "@/lib/db_supabase/jointEventRepo";
import { getTeeGroups, getTeeGroupPlayers } from "@/lib/db_supabase/teeGroupsRepo";
import { getEventRegistrations } from "@/lib/db_supabase/eventRegistrationRepo";
import { getEventGuests } from "@/lib/db_supabase/eventGuestRepo";
import { getMembersBySocietyId } from "@/lib/db_supabase/memberRepo";

describe("loadCanonicalTeeSheet guests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes paid guests from tee_group_players and excludes unpaid guests on member load", async () => {
    vi.mocked(getJointMetaForEventIds).mockResolvedValue(
      new Map([
        [
          "ev1",
          { is_joint_event: false, linkedSocietyCount: 1, participantSocietyIds: ["soc1"] },
        ],
      ]),
    );
    vi.mocked(getEvent).mockResolvedValue({
      id: "ev1",
      society_id: "soc1",
      teeTimePublishedAt: "2026-01-01T00:00:00Z",
      name: "Test",
      playerIds: [],
    } as never);
    vi.mocked(getTeeGroups).mockResolvedValue([
      { id: "g1", event_id: "ev1", group_number: 1, tee_time: "08:00:00" },
    ]);
    vi.mocked(getTeeGroupPlayers).mockResolvedValue([
      { id: "p1", event_id: "ev1", group_number: 1, position: 0, player_id: "member-a" },
      { id: "p2", event_id: "ev1", group_number: 1, position: 1, player_id: guestPlayerId("fred") },
      { id: "p3", event_id: "ev1", group_number: 1, position: 2, player_id: guestPlayerId("unpaid") },
    ]);
    vi.mocked(getEventRegistrations).mockResolvedValue([
      { member_id: "member-a", society_id: "soc1", status: "in", paid: true },
    ] as never);
    vi.mocked(getMembersBySocietyId).mockResolvedValue([
      { id: "member-a", name: "Alice", society_id: "soc1" },
    ] as never);
    vi.mocked(getEventGuests).mockResolvedValue([
      {
        id: "fred",
        society_id: "soc1",
        event_id: "ev1",
        name: "Fred Cuthbertson",
        attendee_type: "guest",
        sex: null,
        handicap_index: 12,
        paid: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "unpaid",
        society_id: "soc1",
        event_id: "ev1",
        name: "Unpaid Guest",
        attendee_type: "guest",
        sex: null,
        handicap_index: null,
        paid: false,
        created_at: "",
        updated_at: "",
      },
    ]);

    const canonical = await loadCanonicalTeeSheet("ev1");
    const names = canonical?.groups.flatMap((g) => g.players.map((p) => p.name)) ?? [];
    expect(names).toContain("Fred Cuthbertson");
    expect(names).not.toContain("Unpaid Guest");
  });
});
