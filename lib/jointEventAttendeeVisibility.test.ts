import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);

import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  resolveEventAttendeesForDisplay,
  resolveJointEventRegistrations,
  summarizeJointEventAttendees,
} from "@/lib/jointEventAttendeeVisibility";
import {
  formatJointAttendeePaymentLabel,
  formatJointAttendeeSourceLabel,
  resolveJointEventAttendees,
  type JointAttendeeSource,
  type JointEventRegistrationRow,
} from "@/lib/jointEventSignups";

const M4 = "society-m4";
const ZGS = "society-zgs";
const HOST = M4;
const societyMap = new Map<string, string>([
  [M4, "M4"],
  [ZGS, "ZGS"],
]);

function reg(
  partial: Partial<JointEventRegistrationRow> & {
    member_id: string;
    society_id: string;
  },
): JointEventRegistrationRow {
  return {
    id: `reg-${partial.member_id}-${partial.society_id}`,
    event_id: "event-1",
    status: "in",
    paid: false,
    amount_paid_pence: 0,
    paid_at: null,
    marked_by_member_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function guest(partial: {
  id: string;
  society_id: string;
  name: string;
  paid?: boolean;
}) {
  return {
    id: partial.id,
    society_id: partial.society_id,
    name: partial.name,
    paid: partial.paid ?? false,
    event_id: "event-1",
    attendee_type: "guest" as const,
    sex: null as const,
    handicap_index: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("formatJointAttendeeSourceLabel", () => {
  it("labels M4 member and ZGS guest", () => {
    const m4Member: JointAttendeeSource[] = [
      { societyId: M4, societyName: "M4", kind: "member", paid: true },
    ];
    const zgsGuest: JointAttendeeSource[] = [
      { societyId: ZGS, societyName: "ZGS", kind: "guest", paid: true },
    ];
    expect(formatJointAttendeeSourceLabel(m4Member)).toBe("M4 Member");
    expect(formatJointAttendeeSourceLabel(zgsGuest)).toBe("ZGS Guest");
  });

  it("labels dual member with representative society", () => {
    const dual: JointAttendeeSource[] = [
      { societyId: M4, societyName: "M4", kind: "member", paid: true },
      { societyId: ZGS, societyName: "ZGS", kind: "member", paid: true },
    ];
    expect(formatJointAttendeeSourceLabel(dual, { representativeSocietyId: M4 })).toBe(
      "Dual / registered via M4",
    );
  });
});

describe("formatJointAttendeePaymentLabel", () => {
  it("shows single Paid or Unpaid when uniform", () => {
    expect(
      formatJointAttendeePaymentLabel([{ societyId: M4, societyName: "M4", kind: "member", paid: true }]),
    ).toBe("Paid");
    expect(
      formatJointAttendeePaymentLabel([{ societyId: ZGS, societyName: "ZGS", kind: "member", paid: false }]),
    ).toBe("Unpaid");
  });

  it("shows per-society payment when mixed", () => {
    expect(
      formatJointAttendeePaymentLabel([
        { societyId: M4, societyName: "M4", kind: "member", paid: true },
        { societyId: ZGS, societyName: "ZGS", kind: "member", paid: false },
      ]),
    ).toBe("Paid via M4 / Unpaid via ZGS");
  });
});

describe("resolveJointEventAttendees", () => {
  it("ZGS viewer sees M4 paid and unpaid members on joint event", () => {
    const rows = resolveJointEventAttendees(
      [
        reg({ member_id: "m4-paid", society_id: M4, member_name: "Brian Dube", paid: true }),
        reg({ member_id: "m4-unpaid", society_id: M4, member_name: "M4 Owes", paid: false }),
        reg({ member_id: "zgs-a", society_id: ZGS, member_name: "ZGS Player", paid: true }),
      ],
      [],
      societyMap,
    );
    const m4Paid = rows.find((r) => r.displayName === "Brian Dube");
    const m4Unpaid = rows.find((r) => r.displayName === "M4 Owes");
    expect(m4Paid?.paymentLabel).toBe("Paid");
    expect(m4Paid?.sourceLabel).toBe("M4 Member");
    expect(m4Unpaid?.paymentLabel).toBe("Unpaid");
    expect(m4Unpaid?.sourceLabel).toBe("M4 Member");
    expect(rows.some((r) => r.displayName === "ZGS Player")).toBe(true);
  });

  it("M4 viewer sees ZGS paid and unpaid members on joint event", () => {
    const rows = resolveJointEventAttendees(
      [
        reg({ member_id: "zgs-paid", society_id: ZGS, member_name: "John Smith", paid: true }),
        reg({ member_id: "zgs-unpaid", society_id: ZGS, member_name: "ZGS Due", paid: false }),
      ],
      [],
      societyMap,
    );
    expect(rows.find((r) => r.displayName === "John Smith")?.paymentLabel).toBe("Paid");
    expect(rows.find((r) => r.displayName === "John Smith")?.sourceLabel).toBe("ZGS Member");
    expect(rows.find((r) => r.displayName === "ZGS Due")?.paymentLabel).toBe("Unpaid");
  });

  it("shows ZGS guest as ZGS Guest", () => {
    const rows = resolveJointEventAttendees(
      [],
      [{ id: "g1", society_id: ZGS, name: "Taka Guest", paid: true }],
      societyMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceLabel).toBe("ZGS Guest");
    expect(rows[0].paymentLabel).toBe("Paid");
  });

  it("shows M4 guest as M4 Guest", () => {
    const rows = resolveJointEventAttendees(
      [],
      [{ id: "g2", society_id: M4, name: "M4 Visitor", paid: false }],
      societyMap,
    );
    expect(rows[0].sourceLabel).toBe("M4 Guest");
    expect(rows[0].paymentLabel).toBe("Unpaid");
  });

  it("shows dual member once with mixed payment labels", () => {
    const rows = resolveJointEventAttendees(
      [
        reg({ member_id: "m4-dual", society_id: M4, user_id: "uid-dual", paid: true }),
        reg({ member_id: "zgs-dual", society_id: ZGS, user_id: "uid-dual", paid: false }),
      ],
      [],
      societyMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].societyBadge).toBe("Dual");
    expect(rows[0].paymentLabel).toBe("Paid via M4 / Unpaid via ZGS");
    expect(rows[0].sourceLabel).toMatch(/^Dual \/ registered via/);
  });
});

describe("resolveEventAttendeesForDisplay", () => {
  const jointRegs = [
    reg({ member_id: "m4-a", society_id: M4, member_name: "M4 Only" }),
    reg({ member_id: "zgs-b", society_id: ZGS, member_name: "ZGS Only" }),
  ];

  it("joint event exposes merged attendees from both societies", () => {
    const rows = resolveEventAttendeesForDisplay({
      isJoint: true,
      regs: jointRegs,
      guests: [],
      activeSocietyId: ZGS,
      participantSocietyIds: [M4, ZGS],
      societyIdToName: societyMap,
    });
    expect(rows.map((r) => r.displayName).sort()).toEqual(["M4 Only", "ZGS Only"]);
  });

  it("non-joint event does not expose other society attendees", () => {
    const rows = resolveEventAttendeesForDisplay({
      isJoint: false,
      regs: jointRegs as EventRegistration[],
      guests: [
        guest({ id: "g-m4", society_id: M4, name: "Host Guest" }),
        guest({ id: "g-zgs", society_id: ZGS, name: "Away Guest" }),
      ],
      activeSocietyId: HOST,
      participantSocietyIds: [HOST],
      societyIdToName: societyMap,
    });
    expect(rows.map((r) => r.displayName)).toEqual(["Host Guest", "M4 Only"]);
    expect(rows.some((r) => r.displayName === "ZGS Only")).toBe(false);
    expect(rows.some((r) => r.displayName === "Away Guest")).toBe(false);
  });

  it("dual member registered via one society shows Dual label when participatingMembers provided", () => {
    const participatingMembers = [
      { id: "m4-ziv", society_id: M4, user_id: "uid-ziv", name: "Ziv Kudenga" },
      { id: "zgs-ziv", society_id: ZGS, user_id: "uid-ziv", name: "Ziv Kudenga" },
    ];
    const rows = resolveEventAttendeesForDisplay({
      isJoint: true,
      regs: [
        reg({
          member_id: "m4-ziv",
          society_id: M4,
          user_id: "uid-ziv",
          member_name: "Ziv Kudenga",
          paid: true,
        }),
      ],
      guests: [],
      activeSocietyId: ZGS,
      participantSocietyIds: [M4, ZGS],
      societyIdToName: societyMap,
      participatingMembers,
    });
    const ziv = rows.find((r) => r.displayName === "Ziv Kudenga");
    expect(ziv?.societyBadge).toBe("Dual");
    expect(ziv?.sourceLabel).toBe("Dual / registered via M4");
    expect(ziv?.paymentLabel).toBe("Paid");
  });
});

describe("resolveJointEventRegistrations", () => {
  const jointRegs = [
    reg({ member_id: "m4-paid", society_id: M4, member_name: "Brian Dube", paid: true }),
    reg({ member_id: "m4-unpaid", society_id: M4, member_name: "M4 Owes", paid: false }),
    reg({ member_id: "zgs-paid", society_id: ZGS, member_name: "John Smith", paid: true }),
    reg({ member_id: "zgs-unpaid", society_id: ZGS, member_name: "ZGS Due", paid: false }),
    reg({ member_id: "m4-dual", society_id: M4, user_id: "uid-dual", member_name: "Dual Member", paid: true }),
    reg({ member_id: "zgs-dual", society_id: ZGS, user_id: "uid-dual", member_name: "Dual Member", paid: false }),
  ];

  const jointOpts = {
    isJoint: true as const,
    regs: jointRegs,
    guests: [
      { id: "g1", society_id: ZGS, name: "Taka Guest", paid: true },
      { id: "g2", society_id: M4, name: "M4 Visitor", paid: false },
    ],
    activeSocietyId: ZGS,
    participantSocietyIds: [M4, ZGS],
    societyIdToName: societyMap,
    attendingMembersOnly: true,
  };

  it("paid list includes M4 and ZGS fully paid members and guests", () => {
    const { paymentLists } = resolveJointEventRegistrations(jointOpts);
    const paid = paymentLists.paidNames.join(" ");
    expect(paid).toContain("Brian Dube");
    expect(paid).toContain("John Smith");
    expect(paid).toContain("Taka Guest");
    expect(paid).not.toContain("M4 Owes");
    expect(paid).not.toContain("ZGS Due");
  });

  it("unpaid list includes M4 and ZGS unpaid members and guests", () => {
    const { paymentLists } = resolveJointEventRegistrations(jointOpts);
    const unpaid = paymentLists.unpaidNames.join(" ");
    expect(unpaid).toContain("M4 Owes");
    expect(unpaid).toContain("ZGS Due");
    expect(unpaid).toContain("M4 Visitor");
    expect(unpaid).toContain("Dual Member");
  });

  it("dual member appears once in unpaid with mixed payment preserved", () => {
    const { paymentLists, attendeeRows } = resolveJointEventRegistrations(jointOpts);
    const dualRows = attendeeRows.filter((r) => r.societyBadge === "Dual");
    expect(dualRows).toHaveLength(1);
    expect(dualRows[0].paymentLabel).toBe("Paid via M4 / Unpaid via ZGS");
    const dualInUnpaid = paymentLists.unpaidNames.filter((n) => n.includes("Dual Member"));
    expect(dualInUnpaid).toHaveLength(1);
    expect(paymentLists.paidNames.some((n) => n.includes("Dual Member"))).toBe(false);
  });

  it("tee sheet eligible ids include paid from both societies, de-duped once", () => {
    const { teeSheetEligibleMemberIds } = resolveJointEventRegistrations(jointOpts);
    expect(teeSheetEligibleMemberIds).toContain("m4-paid");
    expect(teeSheetEligibleMemberIds).toContain("zgs-paid");
    expect(teeSheetEligibleMemberIds).toContain("m4-dual");
    expect(teeSheetEligibleMemberIds).not.toContain("zgs-dual");
    expect(new Set(teeSheetEligibleMemberIds).size).toBe(teeSheetEligibleMemberIds.length);
  });

  it("tee sheet guest player ids include paid M4 and ZGS guests only", () => {
    const { teeSheetEligibleGuestPlayerIds } = resolveJointEventRegistrations(jointOpts);
    expect(teeSheetEligibleGuestPlayerIds).toContain("guest-g1");
    expect(teeSheetEligibleGuestPlayerIds).not.toContain("guest-g2");
    expect(teeSheetEligibleGuestPlayerIds).toHaveLength(1);
  });

  it("unpaid members and guests are not tee sheet eligible by default", () => {
    const { teeSheetEligibleMemberIds, teeSheetEligibleGuestPlayerIds } =
      resolveJointEventRegistrations(jointOpts);
    expect(teeSheetEligibleMemberIds).not.toContain("m4-unpaid");
    expect(teeSheetEligibleMemberIds).not.toContain("zgs-unpaid");
    expect(teeSheetEligibleGuestPlayerIds).not.toContain("guest-g2");
  });

  it("dual member paid in one society appears once in tee sheet pool", () => {
    const { teeSheetEligibleMemberIds } = resolveJointEventRegistrations({
      ...jointOpts,
      regs: [
        reg({ member_id: "m4-dual", society_id: M4, user_id: "uid-dual", paid: true }),
        reg({ member_id: "zgs-dual", society_id: ZGS, user_id: "uid-dual", paid: false }),
      ],
      guests: [],
    });
    expect(teeSheetEligibleMemberIds).toEqual(["m4-dual"]);
  });

  it("non-joint tee sheet eligibility stays society scoped", () => {
    const { teeSheetEligibleMemberIds, teeSheetEligibleGuestPlayerIds } =
      resolveJointEventRegistrations({
        ...jointOpts,
        isJoint: false,
        activeSocietyId: M4,
        participantSocietyIds: [M4],
        guests: [
          { id: "g-m4", society_id: M4, name: "Host Guest", paid: true },
          { id: "g-zgs", society_id: ZGS, name: "Away Guest", paid: true },
        ],
      });
    expect(teeSheetEligibleMemberIds).toContain("m4-paid");
    expect(teeSheetEligibleMemberIds).not.toContain("zgs-paid");
    expect(teeSheetEligibleGuestPlayerIds).toContain("guest-g-m4");
    expect(teeSheetEligibleGuestPlayerIds).not.toContain("guest-g-zgs");
  });

  it("paid member merged with unpaid guest is tee sheet eligible as member", () => {
    const { teeSheetEligibleMemberIds, teeSheetEligibleGuestPlayerIds } =
      resolveJointEventRegistrations({
        ...jointOpts,
        regs: [
          reg({
            member_id: "jade-m",
            society_id: M4,
            member_name: "Jade Muchando",
            paid: true,
          }),
        ],
        guests: [{ id: "g-jade", society_id: M4, name: "jade muchando", paid: false }],
      });
    expect(teeSheetEligibleMemberIds).toEqual(["jade-m"]);
    expect(teeSheetEligibleGuestPlayerIds).toEqual([]);
  });

  it("non-joint path stays society scoped", () => {
    const { paymentLists } = resolveJointEventRegistrations({
      ...jointOpts,
      isJoint: false,
      activeSocietyId: M4,
      participantSocietyIds: [M4],
      guests: [{ id: "g-zgs", society_id: ZGS, name: "Away Guest", paid: false }],
    });
    const names = [...paymentLists.paidNames, ...paymentLists.unpaidNames].join(" ");
    expect(names).toContain("Brian Dube");
    expect(names).not.toContain("John Smith");
    expect(names).not.toContain("Away Guest");
  });

  it("exportRows include society source labels for PDF full-status", () => {
    const { paymentLists } = resolveJointEventRegistrations(jointOpts);
    expect(paymentLists.exportRows?.length).toBeGreaterThan(0);
    const brian = paymentLists.exportRows?.find((r) => r.name === "Brian Dube");
    expect(brian?.typeLabel).toBe("M4 Member");
    expect(brian?.statusLabel).toBe("Paid");
    const taka = paymentLists.exportRows?.find((r) => r.name === "Taka Guest");
    expect(taka?.typeLabel).toBe("ZGS Guest");
  });

  it("merges paid member with unpaid guest when names match (Jade Muchando case)", () => {
    const { attendeeRows, paymentLists } = resolveJointEventRegistrations({
      ...jointOpts,
      regs: [
        reg({
          member_id: "jade-m",
          society_id: M4,
          member_name: "Jade Muchando",
          paid: true,
        }),
      ],
      guests: [{ id: "g-jade", society_id: M4, name: "jade muchando", paid: false }],
    });
    const jadeRows = attendeeRows.filter((r) =>
      r.displayName.toLowerCase().includes("jade muchando"),
    );
    expect(jadeRows).toHaveLength(1);
    expect(jadeRows[0].paymentLabel).toBe("Paid");
    expect(jadeRows[0].sourceLabel).toBe("M4 Member");
    const exportJade = paymentLists.exportRows?.filter((r) =>
      r.name.toLowerCase().includes("jade muchando"),
    );
    expect(exportJade).toHaveLength(1);
    expect(exportJade?.[0]?.statusLabel).toBe("Paid");
  });

  it("Ziv-style dual member registered only via M4 via full resolver", () => {
    const participatingMembers = [
      { id: "m4-ziv", society_id: M4, user_id: "uid-ziv", name: "Ziv Kudenga" },
      { id: "zgs-ziv", society_id: ZGS, user_id: "uid-ziv", name: "Ziv Kudenga" },
    ];
    const { attendeeRows, paymentLists } = resolveJointEventRegistrations({
      ...jointOpts,
      regs: [
        reg({
          member_id: "m4-ziv",
          society_id: M4,
          user_id: "uid-ziv",
          member_name: "Ziv Kudenga",
          paid: true,
        }),
      ],
      guests: [],
      participatingMembers,
    });
    const ziv = attendeeRows.find((r) => r.displayName === "Ziv Kudenga");
    expect(ziv?.societyBadge).toBe("Dual");
    expect(ziv?.sourceLabel).toBe("Dual / registered via M4");
    expect(paymentLists.exportRows?.find((r) => r.name === "Ziv Kudenga")?.typeLabel).toBe(
      "Dual / registered via M4",
    );
  });

  it("dedupes duplicate guest rows with same name (Aulia Alfazema case)", () => {
    const { attendeeRows, paymentLists } = resolveJointEventRegistrations({
      ...jointOpts,
      regs: [],
      guests: [
        { id: "g-a1", society_id: ZGS, name: "Aulia Alfazema", paid: false },
        { id: "g-a2", society_id: ZGS, name: "Aulia Alfazema", paid: false },
      ],
    });
    const auliaRows = attendeeRows.filter((r) =>
      r.displayName.toLowerCase().includes("aulia alfazema"),
    );
    expect(auliaRows).toHaveLength(1);
    expect(paymentLists.exportRows?.filter((r) => r.name === "Aulia Alfazema")).toHaveLength(1);
  });
});

describe("summarizeJointEventAttendees", () => {
  it("counts merged members and guests", () => {
    const rows = resolveJointEventAttendees(
      [
        reg({ member_id: "m1", society_id: M4, member_name: "A", paid: true }),
        reg({ member_id: "m2", society_id: ZGS, member_name: "B", paid: false }),
      ],
      [{ id: "g1", society_id: ZGS, name: "Guest", paid: true }],
      societyMap,
    );
    const summary = summarizeJointEventAttendees(rows);
    expect(summary.attendeeCount).toBe(3);
    expect(summary.memberCount).toBe(2);
    expect(summary.guestCount).toBe(1);
    expect(summary.paidCount).toBe(2);
    expect(summary.unpaidCount).toBe(1);
  });
});
