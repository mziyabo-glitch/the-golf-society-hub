import { describe, expect, it } from "vitest";
import {
  allocateDivisionPotPence,
  filterEligiblePrizePoolEntrants,
  isPrizePoolSupportedEventFormat,
  prizePoolSortOrderForEventFormat,
  splitPotEvenlyAcrossDivisions,
} from "@/lib/event-prize-pools-calc";
import type { EventPrizePoolRow, PrizePoolEntrant } from "@/lib/event-prize-pools-types";

function entrant(
  p: Partial<PrizePoolEntrant> & Pick<PrizePoolEntrant, "dayValue"> & { memberId?: string; guestId?: string },
): PrizePoolEntrant {
  const memberId = p.memberId ?? (p.guestId ? null : "m1");
  const guestId = p.guestId ?? null;
  const participantKey =
    p.participantKey ?? (guestId ? `guest:${guestId}` : `member:${memberId ?? "m1"}`);
  return {
    participantKey,
    memberId: memberId ?? null,
    guestId,
    displayName: p.displayName ?? participantKey,
    societyId: p.societyId ?? "s1",
    registrationId: p.registrationId ?? null,
    divisionName: p.divisionName ?? null,
    sortOrder: p.sortOrder ?? "high_wins",
    dayValue: p.dayValue,
  };
}

describe("isPrizePoolSupportedEventFormat", () => {
  it("accepts canonical formats", () => {
    expect(isPrizePoolSupportedEventFormat("stableford")).toBe(true);
    expect(isPrizePoolSupportedEventFormat("strokeplay_net")).toBe(true);
    expect(isPrizePoolSupportedEventFormat("strokeplay_gross")).toBe(true);
    expect(isPrizePoolSupportedEventFormat("medal")).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isPrizePoolSupportedEventFormat("matchplay")).toBe(false);
    expect(isPrizePoolSupportedEventFormat(null)).toBe(false);
  });
});

describe("prizePoolSortOrderForEventFormat", () => {
  it("stableford high wins", () => {
    expect(prizePoolSortOrderForEventFormat("stableford")).toBe("high_wins");
  });
  it("strokeplay low wins", () => {
    expect(prizePoolSortOrderForEventFormat("strokeplay_net")).toBe("low_wins");
  });
});

describe("splitPotEvenlyAcrossDivisions", () => {
  it("splits remainder deterministically", () => {
    expect(splitPotEvenlyAcrossDivisions(100, 3)).toEqual([34, 33, 33]);
    expect(splitPotEvenlyAcrossDivisions(60, 2)).toEqual([30, 30]);
  });
});

describe("filterEligiblePrizePoolEntrants", () => {
  const pool = {
    require_paid: true,
    require_confirmed: true,
    include_guests: false,
  } as Pick<EventPrizePoolRow, "require_paid" | "require_confirmed" | "include_guests">;

  it("passes entrants through (v1: eligibility is pre-filtered upstream)", () => {
    const a = entrant({ memberId: "a", dayValue: 40 });
    const g = entrant({ guestId: "g1", dayValue: 41 });
    expect(filterEligiblePrizePoolEntrants(pool, [a, g])).toEqual([a, g]);
  });
});

describe("allocateDivisionPotPence", () => {
  const rules50_30_20 = [5000, 3000, 2000];

  it("stableford overall: highest points wins top payout", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "b", dayValue: 36, sortOrder: "high_wins" }),
        entrant({ memberId: "a", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "c", dayValue: 30, sortOrder: "high_wins" }),
      ],
      rulesBps: rules50_30_20,
      divisionPotPence: 10_000,
      divisionName: null,
      eventFormat: "stableford",
    });
    const sum = rows.reduce((x, r) => x + r.payoutAmountPence, 0);
    expect(sum).toBe(10_000);
    const top = rows.find((r) => r.memberId === "a");
    expect(top?.finishingPosition).toBe(1);
    expect(top?.payoutAmountPence).toBe(5000);
  });

  it("strokeplay: lowest net wins", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "x", dayValue: 72, sortOrder: "low_wins" }),
        entrant({ memberId: "y", dayValue: 68, sortOrder: "low_wins" }),
      ],
      rulesBps: [6000, 4000],
      divisionPotPence: 1000,
      divisionName: null,
      eventFormat: "strokeplay_net",
    });
    expect(rows.reduce((s, r) => s + r.payoutAmountPence, 0)).toBe(1000);
    const y = rows.find((r) => r.memberId === "y");
    expect(y?.finishingPosition).toBe(1);
    expect(y?.payoutAmountPence).toBe(600);
  });

  it("stableford: two tie 1st combine 1st+2nd and split", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "b", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "c", dayValue: 36, sortOrder: "high_wins" }),
      ],
      rulesBps: rules50_30_20,
      divisionPotPence: 10_000,
      divisionName: null,
      eventFormat: "stableford",
    });
    expect(rows.reduce((s, r) => s + r.payoutAmountPence, 0)).toBe(10_000);
    const a = rows.find((r) => r.memberId === "a")!;
    const b = rows.find((r) => r.memberId === "b")!;
    expect(a.payoutAmountPence).toBe(b.payoutAmountPence);
    expect(a.payoutAmountPence + b.payoutAmountPence).toBe(8000);
    const c = rows.find((r) => r.memberId === "c")!;
    expect(c.finishingPosition).toBe(3);
    expect(c.payoutAmountPence).toBe(2000);
  });

  it("strokeplay: tie spanning paid positions", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 70, sortOrder: "low_wins" }),
        entrant({ memberId: "b", dayValue: 71, sortOrder: "low_wins" }),
        entrant({ memberId: "c", dayValue: 71, sortOrder: "low_wins" }),
        entrant({ memberId: "d", dayValue: 74, sortOrder: "low_wins" }),
      ],
      rulesBps: [5000, 3000, 2000],
      divisionPotPence: 1000,
      divisionName: null,
      eventFormat: "strokeplay_net",
    });
    expect(rows.reduce((s, r) => s + r.payoutAmountPence, 0)).toBe(1000);
    const a = rows.find((r) => r.memberId === "a")!;
    expect(a.finishingPosition).toBe(1);
    expect(a.payoutAmountPence).toBe(500);
    const b = rows.find((r) => r.memberId === "b")!;
    const c = rows.find((r) => r.memberId === "c")!;
    expect(b.payoutAmountPence).toBe(c.payoutAmountPence);
  });

  it("tie beyond paid places only shares paid slots", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "b", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "c", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "d", dayValue: 40, sortOrder: "high_wins" }),
      ],
      rulesBps: [5000, 3000, 2000],
      divisionPotPence: 10_000,
      divisionName: null,
      eventFormat: "stableford",
    });
    expect(rows.reduce((s, r) => s + r.payoutAmountPence, 0)).toBe(10_000);
    const amounts = rows.map((r) => r.payoutAmountPence).sort((x, y) => y - x);
    expect(amounts.every((x) => x === amounts[0])).toBe(true);
  });

  it("division mode math via separate calls", () => {
    const rules = [10_000];
    const d1 = allocateDivisionPotPence({
      entrants: [entrant({ memberId: "a", dayValue: 40, sortOrder: "high_wins", divisionName: "D1" })],
      rulesBps: rules,
      divisionPotPence: 30,
      divisionName: "D1",
      eventFormat: "stableford",
    });
    const d2 = allocateDivisionPotPence({
      entrants: [entrant({ memberId: "b", dayValue: 39, sortOrder: "high_wins", divisionName: "D2" })],
      rulesBps: rules,
      divisionPotPence: 30,
      divisionName: "D2",
      eventFormat: "stableford",
    });
    expect(d1[0].payoutAmountPence + d2[0].payoutAmountPence).toBe(60);
  });

  it("pence rounding: totals match pot with awkward remainder", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 40, sortOrder: "high_wins" }),
        entrant({ memberId: "b", dayValue: 39, sortOrder: "high_wins" }),
        entrant({ memberId: "c", dayValue: 38, sortOrder: "high_wins" }),
      ],
      rulesBps: [3334, 3333, 3333],
      divisionPotPence: 101,
      divisionName: null,
      eventFormat: "stableford",
    });
    expect(rows.reduce((s, r) => s + r.payoutAmountPence, 0)).toBe(101);
  });

  it("ranks a guest entrant alongside members", () => {
    const rows = allocateDivisionPotPence({
      entrants: [
        entrant({ memberId: "m1", dayValue: 35, sortOrder: "high_wins" }),
        entrant({ guestId: "g99", dayValue: 40, sortOrder: "high_wins", displayName: "Guest Pat" }),
      ],
      rulesBps: [10_000],
      divisionPotPence: 5000,
      divisionName: null,
      eventFormat: "stableford",
    });
    const guestRow = rows.find((r) => r.guestId === "g99");
    expect(guestRow?.finishingPosition).toBe(1);
    expect(guestRow?.payoutAmountPence).toBe(5000);
  });
});
