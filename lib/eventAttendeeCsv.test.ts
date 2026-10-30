import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);

import type { JointEventAttendeeRow } from "@/lib/jointEventSignups";
import { resolveJointEventRegistrations } from "@/lib/jointEventAttendeeVisibility";
import {
  buildEventAttendeeCsvContent,
  buildEventAttendeeCsvRow,
  buildEventAttendeeCsvRows,
  memberGuestKindFromAttendeeRow,
  guestsByIdFromList,
  membersByIdFromLists,
} from "@/lib/eventAttendeeCsv";

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
    member_name: "Test Member",
    ...overrides,
  };
}

describe("memberGuestKindFromAttendeeRow", () => {
  it("labels guest-only rows as Guest", () => {
    const row: JointEventAttendeeRow = {
      key: "guest:g1",
      displayName: "Taka Guest",
      sources: [{ societyId: ZGS, societyName: "ZGS", kind: "guest", paid: true }],
      sourceLabel: "ZGS Guest",
      paymentLabel: "Paid",
      societyBadge: "ZGS",
      registrations: [],
      guestId: "g1",
    };
    expect(memberGuestKindFromAttendeeRow(row)).toBe("Guest");
  });

  it("labels member rows as Member", () => {
    const row: JointEventAttendeeRow = {
      key: "m1",
      displayName: "Brian",
      sources: [{ societyId: M4, societyName: "M4", kind: "member", paid: true }],
      sourceLabel: "M4 Member",
      paymentLabel: "Paid",
      societyBadge: "M4",
      registrations: [reg({ member_id: "m1" }) as never],
    };
    expect(memberGuestKindFromAttendeeRow(row)).toBe("Member");
  });
});

describe("buildEventAttendeeCsvRow", () => {
  const jointOpts = {
    isJoint: true as const,
    regs: [
      reg({ member_id: "m4-dual", society_id: M4, user_id: "uid-dual", member_name: "Dual Member", paid: true }),
      reg({ member_id: "zgs-dual", society_id: ZGS, user_id: "uid-dual", member_name: "Dual Member", paid: false }),
      reg({ member_id: "m4-paid", society_id: M4, member_name: "Brian Dube", paid: true }),
    ],
    guests: [{ id: "g1", society_id: ZGS, name: "Taka Guest", paid: true }],
    activeSocietyId: ZGS,
    participantSocietyIds: [M4, ZGS],
    societyIdToName: societyMap,
    attendingMembersOnly: true,
  };

  it("de-dupes dual members to one CSV row with HI and gender", () => {
    const { attendeeRows } = resolveJointEventRegistrations(jointOpts);
    const dual = attendeeRows.find((r) => r.societyBadge === "Dual");
    expect(dual).toBeDefined();

    const membersById = membersByIdFromLists([
      {
        id: "m4-dual",
        society_id: M4,
        email: "dual@example.com",
        handicap_index: 12.4,
        gender: "male",
      },
    ]);
    const csvRow = buildEventAttendeeCsvRow(dual!, membersById, guestsByIdFromList([]));
    expect(csvRow.Name).toBe("Dual Member");
    expect(csvRow.Gender).toBe("Male");
    expect(csvRow.HI).toBe("12.4");
    expect(csvRow.PI).toBe("");
  });

  it("includes PI from tee sheet overlay", () => {
    const { attendeeRows } = resolveJointEventRegistrations(jointOpts);
    const dual = attendeeRows.find((r) => r.societyBadge === "Dual");
    expect(dual).toBeDefined();

    const overlay = new Map([
      ["m4-dual", { handicapIndex: 12.4, playingHandicap: 11, gender: "male" as const }],
    ]);
    const csvRow = buildEventAttendeeCsvRow(dual!, new Map(), guestsByIdFromList([]), overlay);
    expect(csvRow.HI).toBe("12.4");
    expect(csvRow.PI).toBe("11");
  });

  it("includes guest row with HI and gender", () => {
    const { attendeeRows } = resolveJointEventRegistrations(jointOpts);
    const guest = attendeeRows.find((r) => r.guestId === "g1");
    expect(guest).toBeDefined();

    const guests = guestsByIdFromList([
      {
        id: "g1",
        society_id: ZGS,
        event_id: "ev1",
        name: "Taka Guest",
        attendee_type: "guest",
        sex: "male",
        handicap_index: 18.2,
        paid: true,
        created_at: "",
        updated_at: "",
      },
    ]);
    const csvRow = buildEventAttendeeCsvRow(guest!, new Map(), guests);
    expect(csvRow.Name).toBe("Taka Guest");
    expect(csvRow.Gender).toBe("Male");
    expect(csvRow.HI).toBe("18.2");
    expect(csvRow.PI).toBe("");
  });

  it("builds compact CSV content with 4-column header row", () => {
    const { attendeeRows } = resolveJointEventRegistrations(jointOpts);
    const rows = buildEventAttendeeCsvRows(attendeeRows, new Map(), guestsByIdFromList([]));
    const content = buildEventAttendeeCsvContent(rows);
    expect(content.split("\r\n")[0]).toBe("Name,Gender,HI,PI");
    expect(content).toContain("Brian Dube");
    expect(content).toContain("Taka Guest");
    const dualLines = content.split("\r\n").filter((l) => l.includes("Dual Member"));
    expect(dualLines).toHaveLength(1);
  });
});
