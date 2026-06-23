import { describe, expect, it } from "vitest";
import { memberDocFromRegistrationRow, normalizeMemberDocId } from "@/lib/memberDocUtils";

describe("memberDocUtils", () => {
  it("normalizeMemberDocId prefers id then member_id", () => {
    expect(normalizeMemberDocId({ id: "abc" })).toBe("abc");
    expect(normalizeMemberDocId({ id: "", member_id: "rpc-id" })).toBe("rpc-id");
  });

  it("memberDocFromRegistrationRow builds displayName from registration snapshot", () => {
    const doc = memberDocFromRegistrationRow({
      member_id: "zgs-a",
      society_id: "soc-zgs",
      member_name: "ZGS Player",
    });
    expect(doc.id).toBe("zgs-a");
    expect(doc.displayName).toBe("ZGS Player");
  });
});
