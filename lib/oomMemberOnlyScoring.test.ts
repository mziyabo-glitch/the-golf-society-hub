import { describe, expect, it } from "vitest";
import {
  calculateFieldPositionsAndMemberOomPoints,
  getAveragedOOMPoints,
  getOOMPointsForPosition,
  isGuestEntrantKey,
} from "@/lib/oomMemberOnlyScoring";

describe("isGuestEntrantKey", () => {
  it("detects guest- prefix", () => {
    expect(isGuestEntrantKey("guest-uuid-here")).toBe(true);
    expect(isGuestEntrantKey("member-uuid")).toBe(false);
  });
});

describe("calculateFieldPositionsAndMemberOomPoints (stableford / high_wins)", () => {
  it("guest wins overall, member second — member gets 1st-place member OOM points; guest OOM 0", () => {
    const out = calculateFieldPositionsAndMemberOomPoints(
      [
        { memberId: "guest-g1", memberName: "Pat Guest", dayPoints: "40" },
        { memberId: "m1", memberName: "Member One", dayPoints: "36" },
      ],
      "high_wins",
    );
    const guest = out.find((p) => p.memberId === "guest-g1")!;
    const member = out.find((p) => p.memberId === "m1")!;
    expect(guest.position).toBe(1);
    expect(member.position).toBe(2);
    expect(guest.oomPoints).toBe(0);
    expect(member.oomPoints).toBe(25);
  });

  it("two members + guest: member OOM ranks skip guest", () => {
    const out = calculateFieldPositionsAndMemberOomPoints(
      [
        { memberId: "guest-g1", memberName: "G", dayPoints: "50" },
        { memberId: "m1", memberName: "A", dayPoints: "40" },
        { memberId: "m2", memberName: "B", dayPoints: "30" },
      ],
      "high_wins",
    );
    expect(out.find((p) => p.memberId === "m1")!.oomPoints).toBe(25);
    expect(out.find((p) => p.memberId === "m2")!.oomPoints).toBe(18);
    expect(out.find((p) => p.memberId === "guest-g1")!.oomPoints).toBe(0);
  });

  it("OOM leaderboard semantics: every guest has 0 OOM points (aggregation can sum member rows only)", () => {
    const out = calculateFieldPositionsAndMemberOomPoints(
      [
        { memberId: "guest-g1", memberName: "G1", dayPoints: "99" },
        { memberId: "guest-g2", memberName: "G2", dayPoints: "98" },
        { memberId: "m1", memberName: "M", dayPoints: "10" },
      ],
      "high_wins",
    );
    for (const p of out) {
      if (p.memberId.startsWith("guest-")) expect(p.oomPoints).toBe(0);
    }
    expect(out.find((p) => p.memberId === "m1")!.oomPoints).toBe(25);
  });

  it("member tie block shares averaged OOM among members only", () => {
    const out = calculateFieldPositionsAndMemberOomPoints(
      [
        { memberId: "guest-g1", memberName: "G", dayPoints: "40" },
        { memberId: "m1", memberName: "A", dayPoints: "36" },
        { memberId: "m2", memberName: "B", dayPoints: "36" },
      ],
      "high_wins",
    );
    const m1 = out.find((p) => p.memberId === "m1")!;
    const m2 = out.find((p) => p.memberId === "m2")!;
    const avg = getAveragedOOMPoints(1, 2);
    expect(m1.oomPoints).toBe(avg);
    expect(m2.oomPoints).toBe(avg);
    expect(avg).toBe((25 + 18) / 2);
  });
});

describe("calculateFieldPositionsAndMemberOomPoints (strokeplay / low_wins)", () => {
  it("guest best net, member second — member earns top member OOM points", () => {
    const out = calculateFieldPositionsAndMemberOomPoints(
      [
        { memberId: "guest-g1", memberName: "G", dayPoints: "68" },
        { memberId: "m1", memberName: "M", dayPoints: "72" },
      ],
      "low_wins",
    );
    expect(out.find((p) => p.memberId === "guest-g1")!.position).toBe(1);
    expect(out.find((p) => p.memberId === "m1")!.position).toBe(2);
    expect(out.find((p) => p.memberId === "guest-g1")!.oomPoints).toBe(0);
    expect(out.find((p) => p.memberId === "m1")!.oomPoints).toBe(25);
  });
});

describe("getOOMPointsForPosition", () => {
  it("returns 0 beyond top 10", () => {
    expect(getOOMPointsForPosition(11)).toBe(0);
  });
});
