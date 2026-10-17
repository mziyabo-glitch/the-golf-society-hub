import { describe, expect, it } from "vitest";
import { getPermissionsForMember } from "@/lib/rbac";

describe("tee sheet ManCo permissions", () => {
  const roles = (r: string[]) => ({ id: "m1", roles: r });

  it("allows captain, secretary, treasurer, handicapper to generate tee sheets", () => {
    for (const role of ["captain", "secretary", "treasurer", "handicapper"] as const) {
      expect(getPermissionsForMember(roles([role])).canGenerateTeeSheet).toBe(true);
    }
  });

  it("denies plain members", () => {
    expect(getPermissionsForMember(roles(["member"])).canGenerateTeeSheet).toBe(false);
  });
});
