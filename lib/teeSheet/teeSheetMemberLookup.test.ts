import { describe, expect, it } from "vitest";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import { buildMemberByPlayerIdMap, memberDocForPlayerId } from "@/lib/teeSheet/teeSheetMemberLookup";

function member(partial: Partial<MemberDoc> & { id: string }): MemberDoc {
  return {
    society_id: partial.society_id ?? "soc-a",
    user_id: partial.user_id ?? null,
    displayName: partial.displayName ?? partial.name,
    roles: ["member"],
    ...partial,
  } as MemberDoc;
}

describe("teeSheetMemberLookup", () => {
  it("maps dual-society duplicate ids to representative with gender", () => {
    const members = [
      member({
        id: "m4-id",
        society_id: "m4",
        user_id: "user-1",
        name: "Fungai Fundira",
        gender: "male",
      }),
      member({
        id: "zgs-id",
        society_id: "zgs",
        name: "Fungai Fundira",
        gender: null,
      }),
    ];
    const societyIdToName = new Map([
      ["m4", "M4 Fairway"],
      ["zgs", "ZGS"],
    ]);
    const map = buildMemberByPlayerIdMap(members, societyIdToName);
    expect(memberDocForPlayerId("zgs-id", members, map)?.gender).toBe("male");
    expect(memberDocForPlayerId("m4-id", members, map)?.gender).toBe("male");
  });
});
