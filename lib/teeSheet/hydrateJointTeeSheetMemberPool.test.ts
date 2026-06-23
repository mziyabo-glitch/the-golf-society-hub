import { describe, expect, it, vi } from "vitest";
import type { EventRegistration } from "@/lib/db_supabase/eventRegistrationRepo";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import { hydrateJointTeeSheetMemberPool } from "@/lib/teeSheet/hydrateJointTeeSheetMemberPool";

const M4 = "soc-m4";
const ZGS = "soc-zgs";

function reg(partial: Partial<EventRegistration> & Pick<EventRegistration, "member_id">): EventRegistration {
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

describe("hydrateJointTeeSheetMemberPool", () => {
  it("keeps cross-society candidate ids when RLS hydration returns only active society", async () => {
    const candidateMemberIds = ["m4-a", "m4-b", "zgs-a", "zgs-b"];
    const registrations = [
      reg({
        member_id: "m4-a",
        society_id: M4,
        member_name: "M4 One",
      } as EventRegistration & { member_name: string }),
      reg({
        member_id: "m4-b",
        society_id: M4,
        member_name: "M4 Two",
      } as EventRegistration & { member_name: string }),
      reg({
        member_id: "zgs-a",
        society_id: ZGS,
        member_name: "ZGS One",
      } as EventRegistration & { member_name: string }),
      reg({
        member_id: "zgs-b",
        society_id: ZGS,
        member_name: "ZGS Two",
      } as EventRegistration & { member_name: string }),
    ];

    const fetchMembersByIds = vi.fn(async (ids: string[]) =>
      ids
        .filter((id) => id.startsWith("m4-"))
        .map(
          (id): MemberDoc => ({
            id,
            society_id: M4,
            name: `Local ${id}`,
          }),
        ),
    );

    const pool = await hydrateJointTeeSheetMemberPool({
      candidateMemberIds,
      pooledMembers: [
        { member_id: "m4-a", society_id: M4, name: "Broken id row" } as MemberDoc,
      ],
      registrations,
      fetchMembersByIds,
    });

    expect(fetchMembersByIds).toHaveBeenCalled();
    expect(pool.map((m) => m.id).sort()).toEqual(candidateMemberIds.sort());
    expect(pool.find((m) => m.id === "zgs-a")?.displayName).toBe("ZGS One");
  });

  it("normalizes visibility RPC rows that use member_id instead of id", async () => {
    const pool = await hydrateJointTeeSheetMemberPool({
      candidateMemberIds: ["m4-a"],
      pooledMembers: [{ member_id: "m4-a", society_id: M4, name: "From RPC" } as MemberDoc],
      registrations: [],
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].id).toBe("m4-a");
    expect(pool[0].displayName).toBe("From RPC");
  });
});
