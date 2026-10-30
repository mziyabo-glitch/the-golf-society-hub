import { describe, expect, it } from "vitest";
import {
  getPermissionsForMember,
  canExportEventAttendeesForSociety,
  canManageEventPaymentsForSociety,
  canShareEventPaymentListsForSociety,
  type Role,
} from "@/lib/rbac";
import { resolveTeeSheetManageAccess } from "@/lib/teeSheet/teeSheetManageAccess";

const SOCIETY = "society-test";

function memberWithRole(role: Role) {
  return { id: "m1", roles: [role] };
}

function membership(role: Role) {
  return [{ societyId: SOCIETY, role }];
}

describe("RBAC role matrix (Phase 6)", () => {
  describe("ordinary MEMBER", () => {
    const p = getPermissionsForMember(memberWithRole("MEMBER"));

    it("can edit own profile but not ManCo tools", () => {
      expect(p.canEditOwnProfile).toBe(true);
      expect(p.canGenerateTeeSheet).toBe(false);
      expect(p.canAccessFinance).toBe(false);
      expect(p.canManageHandicaps).toBe(false);
    });

    it("cannot manage event payments or export attendees", () => {
      expect(canManageEventPaymentsForSociety(membership("MEMBER"), SOCIETY)).toBe(false);
      expect(canExportEventAttendeesForSociety(membership("MEMBER"), SOCIETY)).toBe(false);
    });

    it("is blocked from tee sheet manage URL", () => {
      expect(
        resolveTeeSheetManageAccess({
          userId: "u1",
          memberships: membership("MEMBER"),
          participantSocietyIds: [],
          hostSocietyId: SOCIETY,
          isPlatformAdmin: false,
        }).allowed,
      ).toBe(false);
    });
  });

  describe("CAPTAIN", () => {
    const p = getPermissionsForMember(memberWithRole("CAPTAIN"));

    it("has full society and tee sheet authority", () => {
      expect(p.canGenerateTeeSheet).toBe(true);
      expect(p.canAccessFinance).toBe(true);
      expect(p.canManageRoles).toBe(true);
      expect(p.canShareEventPaymentLists).toBe(true);
    });

    it("can export attendees and manage payments in active society", () => {
      expect(canExportEventAttendeesForSociety(membership("CAPTAIN"), SOCIETY)).toBe(true);
      expect(canManageEventPaymentsForSociety(membership("CAPTAIN"), SOCIETY)).toBe(true);
    });
  });

  describe("HANDICAPPER", () => {
    const p = getPermissionsForMember(memberWithRole("HANDICAPPER"));

    it("can generate tee sheets and manage handicaps but not finance share lists", () => {
      expect(p.canGenerateTeeSheet).toBe(true);
      expect(p.canManageHandicaps).toBe(true);
      expect(p.canAccessFinance).toBe(false);
      expect(p.canShareEventPaymentLists).toBe(false);
    });

    it("can export attendee CSV", () => {
      expect(canExportEventAttendeesForSociety(membership("HANDICAPPER"), SOCIETY)).toBe(true);
    });

    it("cannot share payment lists", () => {
      expect(canShareEventPaymentListsForSociety(membership("HANDICAPPER"), SOCIETY)).toBe(false);
    });
  });

  describe("TREASURER", () => {
    const p = getPermissionsForMember(memberWithRole("TREASURER"));

    it("has finance access and tee sheet generation", () => {
      expect(p.canAccessFinance).toBe(true);
      expect(p.canGenerateTeeSheet).toBe(true);
      expect(p.canManageMembershipFees).toBe(true);
    });

    it("cannot export attendee CSV (captain/handicapper only)", () => {
      expect(canExportEventAttendeesForSociety(membership("TREASURER"), SOCIETY)).toBe(false);
    });
  });

  describe("platform admin tee sheet override", () => {
    it("allows platform admin even as ordinary member", () => {
      const result = resolveTeeSheetManageAccess({
        userId: "admin-u",
        memberships: membership("MEMBER"),
        participantSocietyIds: [],
        hostSocietyId: SOCIETY,
        isPlatformAdmin: true,
      });
      expect(result.allowed).toBe(true);
      expect(result.via).toBe("platform_admin");
    });
  });
});
