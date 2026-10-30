import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);

import type { JointEventRegistrationRow } from "@/lib/jointEventSignups";
import { resolveJointEventRegistrations } from "@/lib/jointEventAttendeeVisibility";

const M4 = "soc-m4";
const ZGS = "soc-zgs";

function reg(partial: Partial<JointEventRegistrationRow> & Pick<JointEventRegistrationRow, "member_id">): JointEventRegistrationRow {
  return {
    id: `reg-${partial.member_id}`,
    society_id: partial.society_id ?? M4,
    event_id: "evt-1",
    status: "in",
    paid: true,
    amount_paid_pence: 0,
    paid_at: null,
    marked_by_member_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function registrationSocietyIds(regs: JointEventRegistrationRow[]): string[] {
  return [...new Set(regs.map((r) => String(r.society_id)).filter(Boolean))];
}

describe("joint tee sheet candidate eligibility", () => {
  it("includes paid members from both participating societies", () => {
    const regs = [
      reg({ member_id: "m4-a", society_id: M4, member_name: "M4 One" }),
      reg({ member_id: "zgs-a", society_id: ZGS, member_name: "ZGS One" }),
      reg({ member_id: "zgs-b", society_id: ZGS, paid: false }),
    ];
    const { teeSheetEligibleMemberIds } = resolveJointEventRegistrations({
      isJoint: true,
      regs,
      guests: [],
      activeSocietyId: M4,
      participantSocietyIds: [M4, ZGS],
      societyIdToName: new Map([
        [M4, "M4"],
        [ZGS, "ZGS"],
      ]),
      attendingMembersOnly: true,
    });

    expect(teeSheetEligibleMemberIds.sort()).toEqual(["m4-a", "zgs-a"]);
    expect(registrationSocietyIds(regs)).toEqual([M4, ZGS]);
  });

  it("single-society registration payload is the RPC-fallback symptom for joint events", () => {
    const regs = [
      reg({ member_id: "m4-a", society_id: M4 }),
      reg({ member_id: "m4-b", society_id: M4 }),
    ];
    const participantSocietyIds = [M4, ZGS];
    const societiesInRegs = registrationSocietyIds(regs);

    expect(participantSocietyIds.length).toBeGreaterThanOrEqual(2);
    expect(societiesInRegs).toEqual([M4]);
  });
});
