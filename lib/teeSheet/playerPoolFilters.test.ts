import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);

import { resolveJointEventRegistrations } from "@/lib/jointEventAttendeeVisibility";
import {
  buildPlayerPoolItems,
  filterPlayerPoolItems,
  DEFAULT_PLAYER_POOL_FILTERS,
} from "@/lib/teeSheet/playerPoolFilters";

const M4 = "soc-m4";
const ZGS = "soc-zgs";
const societyMap = new Map([
  [M4, "M4"],
  [ZGS, "ZGS"],
]);

function reg(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    society_id: M4,
    event_id: "ev1",
    member_id: "m1",
    status: "in" as const,
    paid: false,
    amount_paid_pence: 0,
    paid_at: null,
    marked_by_member_id: null,
    created_at: "",
    updated_at: "",
    member_name: "Test",
    ...overrides,
  };
}

const jointOpts = {
  isJoint: true as const,
  regs: [
    reg({ member_id: "m-paid", society_id: M4, member_name: "Paid Member", paid: true }),
    reg({ member_id: "m-unpaid", society_id: ZGS, member_name: "Unpaid Member", paid: false }),
  ],
  guests: [
    { id: "g-paid", society_id: ZGS, name: "Paid Guest", paid: true },
    { id: "g-unpaid", society_id: M4, name: "Unpaid Guest", paid: false },
  ],
  activeSocietyId: M4,
  participantSocietyIds: [M4, ZGS],
  societyIdToName: societyMap,
  attendingMembersOnly: true,
};

describe("filterPlayerPoolItems", () => {
  const { attendeeRows } = resolveJointEventRegistrations(jointOpts);
  const items = buildPlayerPoolItems(attendeeRows, new Map(), new Map());

  it("filters paid only", () => {
    const filtered = filterPlayerPoolItems(items, {
      ...DEFAULT_PLAYER_POOL_FILTERS,
      paidOnly: true,
    });
    expect(filtered.every((i) => i.paid)).toBe(true);
    expect(filtered.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Paid Member", "Paid Guest"]),
    );
    expect(filtered.some((i) => i.name === "Unpaid Member")).toBe(false);
  });

  it("filters unpaid only", () => {
    const filtered = filterPlayerPoolItems(items, {
      ...DEFAULT_PLAYER_POOL_FILTERS,
      unpaidOnly: true,
    });
    expect(filtered.map((i) => i.name)).toEqual(
      expect.arrayContaining(["Unpaid Member", "Unpaid Guest"]),
    );
    expect(filtered.some((i) => i.name === "Paid Member")).toBe(false);
  });

  it("filters members only", () => {
    const filtered = filterPlayerPoolItems(items, {
      ...DEFAULT_PLAYER_POOL_FILTERS,
      membersOnly: true,
    });
    expect(filtered.every((i) => i.kind === "member")).toBe(true);
    expect(filtered).toHaveLength(2);
  });

  it("filters guests only", () => {
    const filtered = filterPlayerPoolItems(items, {
      ...DEFAULT_PLAYER_POOL_FILTERS,
      guestsOnly: true,
    });
    expect(filtered.every((i) => i.kind === "guest")).toBe(true);
    expect(filtered).toHaveLength(2);
  });

  it("filters by society id", () => {
    const filtered = filterPlayerPoolItems(items, {
      ...DEFAULT_PLAYER_POOL_FILTERS,
      societyId: M4,
    });
    expect(filtered.every((i) => i.societyIds.includes(M4))).toBe(true);
    expect(filtered.some((i) => i.name === "Paid Member")).toBe(true);
    expect(filtered.some((i) => i.name === "Unpaid Member")).toBe(false);
  });

  it("filters by name search", () => {
    const filtered = filterPlayerPoolItems(items, {
      ...DEFAULT_PLAYER_POOL_FILTERS,
      searchQuery: "guest",
    });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((i) => i.name.toLowerCase().includes("guest"))).toBe(true);
  });
});
