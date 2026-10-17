import { describe, expect, it } from "vitest";

import { shouldBootstrapSelfHealActiveSociety } from "./bootstrapMembershipHeal";

describe("shouldBootstrapSelfHealActiveSociety", () => {
  it("heals when active society is missing and user has memberships", () => {
    expect(
      shouldBootstrapSelfHealActiveSociety({
        membershipCount: 2,
        activeMissing: true,
        activeStaleInList: false,
        userHasDirectMemberForActive: false,
      }),
    ).toBe(true);
  });

  it("does not heal when list omits active society but direct member row exists (post-join lag)", () => {
    expect(
      shouldBootstrapSelfHealActiveSociety({
        membershipCount: 1,
        activeMissing: false,
        activeStaleInList: true,
        userHasDirectMemberForActive: true,
      }),
    ).toBe(false);
  });

  it("heals when active is stale in list and there is no direct member row", () => {
    expect(
      shouldBootstrapSelfHealActiveSociety({
        membershipCount: 2,
        activeMissing: false,
        activeStaleInList: true,
        userHasDirectMemberForActive: false,
      }),
    ).toBe(true);
  });

  it("does not heal with zero memberships", () => {
    expect(
      shouldBootstrapSelfHealActiveSociety({
        membershipCount: 0,
        activeMissing: true,
        activeStaleInList: false,
        userHasDirectMemberForActive: false,
      }),
    ).toBe(false);
  });
});
