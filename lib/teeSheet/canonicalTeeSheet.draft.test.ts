import { describe, expect, it, vi, beforeEach } from "vitest";

vi.stubGlobal("__DEV__", false);
import { loadCanonicalTeeSheet } from "@/lib/teeSheet/canonicalTeeSheet";

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
  isTeeSheetEligible: () => false,
}));

vi.mock("@/lib/db_supabase/eventGuestRepo", () => ({
  getEventGuests: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db_supabase/memberRepo", () => ({
  getMembersBySocietyId: vi.fn(),
  getMembersByIds: vi.fn().mockResolvedValue([]),
}));

import { getEvent } from "@/lib/db_supabase/eventRepo";
import { getJointMetaForEventIds } from "@/lib/db_supabase/jointEventRepo";
import { getTeeGroups, getTeeGroupPlayers } from "@/lib/db_supabase/teeGroupsRepo";
import { getEventRegistrations } from "@/lib/db_supabase/eventRegistrationRepo";
import { getMembersBySocietyId } from "@/lib/db_supabase/memberRepo";

describe("loadCanonicalTeeSheet preserveDraftPlayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps ineligible saved players when preserveDraftPlayers is true", async () => {
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
      teeTimePublishedAt: null,
      name: "Test",
      playerIds: [],
    } as never);
    vi.mocked(getTeeGroups).mockResolvedValue([
      { id: "g1", event_id: "ev1", group_number: 1, tee_time: "08:00:00" },
    ]);
    vi.mocked(getTeeGroupPlayers).mockResolvedValue([
      { id: "p1", event_id: "ev1", group_number: 1, position: 0, player_id: "member-a" },
    ]);
    vi.mocked(getEventRegistrations).mockResolvedValue([]);
    vi.mocked(getMembersBySocietyId).mockResolvedValue([
      { id: "member-a", name: "Alice", society_id: "soc1" },
    ] as never);

    const filtered = await loadCanonicalTeeSheet("ev1");
    const draft = await loadCanonicalTeeSheet("ev1", { preserveDraftPlayers: true });

    expect(filtered?.groups.flatMap((g) => g.players).length ?? 0).toBe(0);
    expect(draft?.source).toBe("tee_groups");
    expect(draft?.groups[0]?.players[0]?.id).toBe("member-a");
  });
});
