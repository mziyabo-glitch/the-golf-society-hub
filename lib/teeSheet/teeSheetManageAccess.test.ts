import { describe, expect, it } from "vitest";
import {
  linkedEventSocietyIds,
  resolveTeeSheetManageAccess,
  TEE_SHEET_ACCESS_DENIED_MESSAGE,
} from "@/lib/teeSheet/teeSheetManageAccess";

const M4 = "society-m4";
const ZGS = "society-zgs";
const OTHER = "society-other";

function manco(role: string, societyId: string) {
  return { societyId, role };
}

describe("resolveTeeSheetManageAccess", () => {
  it("allows authorised M4 captain for an M4 event", () => {
    const result = resolveTeeSheetManageAccess({
      userId: "user-1",
      memberships: [manco("CAPTAIN", M4)],
      participantSocietyIds: [],
      hostSocietyId: M4,
      isPlatformAdmin: false,
    });
    expect(result).toEqual({ allowed: true, via: "participating_manco" });
  });

  it("allows authorised ZGS administrator for a ZGS event", () => {
    const result = resolveTeeSheetManageAccess({
      userId: "user-1",
      memberships: [manco("SECRETARY", ZGS)],
      participantSocietyIds: [],
      hostSocietyId: ZGS,
      isPlatformAdmin: false,
    });
    expect(result).toEqual({ allowed: true, via: "participating_manco" });
  });

  it("allows authorised administrator for a joint M4/ZGS event", () => {
    const result = resolveTeeSheetManageAccess({
      userId: "user-1",
      memberships: [manco("TREASURER", M4)],
      participantSocietyIds: [M4, ZGS],
      hostSocietyId: M4,
      isPlatformAdmin: false,
    });
    expect(result).toEqual({ allowed: true, via: "participating_manco" });
  });

  it("blocks M4-only administrator from an unrelated society event", () => {
    const result = resolveTeeSheetManageAccess({
      userId: "user-1",
      memberships: [manco("CAPTAIN", M4)],
      participantSocietyIds: [],
      hostSocietyId: OTHER,
      isPlatformAdmin: false,
    });
    expect(result).toEqual({ allowed: false, reason: "not_participating_manco" });
  });

  it("blocks ordinary member attempting direct URL access", () => {
    const result = resolveTeeSheetManageAccess({
      userId: "user-1",
      memberships: [{ societyId: M4, role: "MEMBER" }],
      participantSocietyIds: [],
      hostSocietyId: M4,
      isPlatformAdmin: false,
    });
    expect(result).toEqual({ allowed: false, reason: "not_manco" });
  });

  it("blocks unauthenticated direct URL access", () => {
    const result = resolveTeeSheetManageAccess({
      userId: null,
      memberships: [],
      participantSocietyIds: [],
      hostSocietyId: M4,
      isPlatformAdmin: false,
    });
    expect(result).toEqual({ allowed: false, reason: "unauthenticated" });
  });

  it("allows platform administrator for any event", () => {
    const result = resolveTeeSheetManageAccess({
      userId: "admin-1",
      memberships: [],
      participantSocietyIds: [],
      hostSocietyId: OTHER,
      isPlatformAdmin: true,
    });
    expect(result).toEqual({ allowed: true, via: "platform_admin" });
  });
});

describe("linkedEventSocietyIds", () => {
  it("prefers participant societies over host-only fallback", () => {
    expect(linkedEventSocietyIds([M4, ZGS], OTHER)).toEqual([M4, ZGS]);
    expect(linkedEventSocietyIds([], M4)).toEqual([M4]);
  });
});

describe("TEE_SHEET_ACCESS_DENIED_MESSAGE", () => {
  it("is user-facing and explicit", () => {
    expect(TEE_SHEET_ACCESS_DENIED_MESSAGE).toMatch(/permission to manage this event/i);
  });
});
