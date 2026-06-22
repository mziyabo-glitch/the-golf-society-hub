import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("__DEV__", false);

import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  dedupeJointSignupMemberIds,
  mergeJointEventSignups,
  shouldMergeSignupIdentities,
  signupIdentityFromRegistration,
  type JointEventRegistrationRow,
} from "@/lib/jointEventSignups";

const M4 = "society-m4";
const ZGS = "society-zgs";
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

describe("shouldMergeSignupIdentities", () => {
  it("merges on same user_id", () => {
    const a = { memberId: "m1", societyId: M4, user_id: "uid-1", email: null, name: "Alice" };
    const b = { memberId: "m2", societyId: ZGS, user_id: "uid-1", email: null, name: "Alice Z" };
    expect(shouldMergeSignupIdentities(a, b)).toBe(true);
  });

  it("merges on same email", () => {
    const a = { memberId: "m1", societyId: M4, user_id: null, email: "bob@example.com", name: "Bob" };
    const b = { memberId: "m2", societyId: ZGS, user_id: null, email: "bob@example.com", name: "Robert" };
    expect(shouldMergeSignupIdentities(a, b)).toBe(true);
  });

  it("merges on normalized full name fallback", () => {
    const a = { memberId: "m1", societyId: M4, user_id: null, email: null, name: "  Terry   Manthando " };
    const b = { memberId: "m2", societyId: ZGS, user_id: null, email: null, name: "terry manthando" };
    expect(shouldMergeSignupIdentities(a, b)).toBe(true);
  });
});

describe("mergeJointEventSignups", () => {
  it("shows M4-only member once with M4 badge", () => {
    const rows = mergeJointEventSignups(
      [reg({ member_id: "m4-only", society_id: M4, member_name: "Solo M4" })],
      societyMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe("Solo M4");
    expect(rows[0].societyBadge).toBe("M4");
  });

  it("shows ZGS-only member once with ZGS badge", () => {
    const rows = mergeJointEventSignups(
      [reg({ member_id: "zgs-only", society_id: ZGS, member_name: "Solo ZGS" })],
      societyMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].societyBadge).toBe("ZGS");
  });

  it("shows dual member once with Dual badge when same user_id", () => {
    const rows = mergeJointEventSignups(
      [
        reg({
          member_id: "m4-dual",
          society_id: M4,
          user_id: "uid-dual",
          member_name: "Dual Player",
        }),
        reg({
          member_id: "zgs-dual",
          society_id: ZGS,
          user_id: "uid-dual",
          member_name: "Dual Player",
        }),
      ],
      societyMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].societyBadge).toBe("Dual");
    expect(rows[0].mergedMemberIds).toEqual(expect.arrayContaining(["m4-dual", "zgs-dual"]));
  });

  it("de-dupes same email from both societies", () => {
    const rows = mergeJointEventSignups(
      [
        reg({
          member_id: "m4-e",
          society_id: M4,
          member_email: "same@club.com",
          member_name: "Email Match",
        }),
        reg({
          member_id: "zgs-e",
          society_id: ZGS,
          member_email: "same@club.com",
          member_name: "Email Match",
        }),
      ],
      societyMap,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].registrations).toHaveLength(2);
  });

  it("preserves society-scoped registration rows on merged signup", () => {
    const rows = mergeJointEventSignups(
      [
        reg({ member_id: "m4-dual", society_id: M4, user_id: "u1", paid: true }),
        reg({ member_id: "zgs-dual", society_id: ZGS, user_id: "u1", paid: false }),
      ],
      societyMap,
    );
    expect(rows[0].registrations.find((r) => r.society_id === M4)?.paid).toBe(true);
    expect(rows[0].registrations.find((r) => r.society_id === ZGS)?.paid).toBe(false);
  });

  it("ZGS admin merged list includes M4 and ZGS signups", () => {
    const allRegs = [
      reg({ member_id: "m4-a", society_id: M4, member_name: "M4 Player" }),
      reg({ member_id: "zgs-b", society_id: ZGS, member_name: "ZGS Player" }),
    ];
    const merged = mergeJointEventSignups(allRegs, societyMap);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.societyBadge).sort()).toEqual(["M4", "ZGS"]);
  });
});

describe("dedupeJointSignupMemberIds", () => {
  const members: MemberDoc[] = [
    { id: "m4-dual", society_id: M4, user_id: "uid-1", name: "Dual" },
    { id: "zgs-dual", society_id: ZGS, user_id: "uid-1", name: "Dual" },
    { id: "m4-only", society_id: M4, name: "Only M4" },
  ];

  it("returns de-duped merged list for tee sheet candidates", () => {
    const ids = dedupeJointSignupMemberIds(
      ["m4-dual", "zgs-dual", "m4-only"],
      members,
      societyMap,
    );
    expect(ids).toHaveLength(2);
    expect(ids).toContain("m4-only");
    expect(ids.some((id) => id === "m4-dual" || id === "zgs-dual")).toBe(true);
  });
});

describe("signupIdentityFromRegistration", () => {
  it("uses joined RPC member fields when MemberDoc is absent", () => {
    const identity = signupIdentityFromRegistration(
      reg({
        member_id: "x",
        society_id: M4,
        user_id: "uid-x",
        member_email: "x@test.com",
        member_name: "X",
      }),
    );
    expect(identity.user_id).toBe("uid-x");
    expect(identity.email).toBe("x@test.com");
  });
});
