import { describe, expect, it } from "vitest";
import {
  allocateDivisionPotPence,
  allocateSplitterPotPence,
  derivePrizePoolTotalAmountPence,
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
    front9Value: p.front9Value ?? null,
    back9Value: p.back9Value ?? null,
    birdieCount: p.birdieCount ?? null,
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

describe("derivePrizePoolTotalAmountPence", () => {
  it("manual mode keeps entered total", () => {
    expect(
      derivePrizePoolTotalAmountPence({
        totalAmountMode: "manual",
        manualTotalAmountPence: 12_345,
        potEntryValuePence: 1_000,
        confirmedEntrantCount: 9,
      }),
    ).toBe(12_345);
  });

  it("per-entrant mode derives total from confirmed entrants", () => {
    expect(
      derivePrizePoolTotalAmountPence({
        totalAmountMode: "per_entrant",
        manualTotalAmountPence: 0,
        potEntryValuePence: 1_000,
        confirmedEntrantCount: 12,
      }),
    ).toBe(12_000);
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

describe("allocateSplitterPotPence", () => {
  it("splitter stableford with unique winners", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({
          memberId: "a",
          dayValue: 41,
          front9Value: 20,
          back9Value: 21,
          birdieCount: 3,
          sortOrder: "high_wins",
        }),
        entrant({
          memberId: "b",
          dayValue: 39,
          front9Value: 22,
          back9Value: 17,
          birdieCount: 1,
          sortOrder: "high_wins",
        }),
        entrant({
          memberId: "c",
          dayValue: 40,
          front9Value: 18,
          back9Value: 23,
          birdieCount: 2,
          sortOrder: "high_wins",
        }),
      ],
      totalPotPence: 12_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    });

    const sum = rows.reduce((s, r) => s + r.payoutAmountPence, 0);
    expect(sum).toBe(12_000);
    expect(rows.find((r) => r.divisionName === "Best Front 9")?.memberId).toBe("b");
    expect(rows.find((r) => r.divisionName === "Best Back 9")?.memberId).toBe("c");
    expect(rows.find((r) => r.divisionName === "Most Birdies")?.memberId).toBe("a");
    expect(rows.find((r) => r.divisionName === "Best Overall Score")?.memberId).toBe("a");
    expect(rows.find((r) => r.divisionName === "Best Overall Score")?.payoutAmountPence).toBe(4800);
  });

  it("splitter strokeplay with unique winners", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({
          memberId: "a",
          dayValue: 71,
          front9Value: 35,
          back9Value: 36,
          birdieCount: 2,
          sortOrder: "low_wins",
        }),
        entrant({
          memberId: "b",
          dayValue: 70,
          front9Value: 34,
          back9Value: 39,
          birdieCount: 1,
          sortOrder: "low_wins",
        }),
        entrant({
          memberId: "c",
          dayValue: 73,
          front9Value: 36,
          back9Value: 34,
          birdieCount: 3,
          sortOrder: "low_wins",
        }),
      ],
      totalPotPence: 10_000,
      eventFormat: "strokeplay_net",
      birdieFallbackToOverall: true,
    });
    expect(rows.find((r) => r.divisionName === "Best Front 9")?.memberId).toBe("b");
    expect(rows.find((r) => r.divisionName === "Best Back 9")?.memberId).toBe("c");
    expect(rows.find((r) => r.divisionName === "Most Birdies")?.memberId).toBe("c");
    expect(rows.find((r) => r.divisionName === "Best Overall Score")?.memberId).toBe("b");
  });

  it("tie on front 9 splits payout", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 39, front9Value: 20, back9Value: 19, birdieCount: 1 }),
        entrant({ memberId: "b", dayValue: 38, front9Value: 20, back9Value: 18, birdieCount: 2 }),
      ],
      totalPotPence: 1_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    }).filter((r) => r.divisionName === "Best Front 9");
    expect(rows.length).toBe(2);
    expect(rows[0].payoutAmountPence).toBe(rows[1].payoutAmountPence);
    expect(rows[0].payoutAmountPence + rows[1].payoutAmountPence).toBe(200);
  });

  it("tie on back 9 splits payout", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 39, front9Value: 18, back9Value: 21, birdieCount: 1 }),
        entrant({ memberId: "b", dayValue: 38, front9Value: 19, back9Value: 21, birdieCount: 2 }),
      ],
      totalPotPence: 1_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    }).filter((r) => r.divisionName === "Best Back 9");
    expect(rows.length).toBe(2);
    expect(rows[0].payoutAmountPence + rows[1].payoutAmountPence).toBe(200);
  });

  it("tie on most birdies splits payout", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 39, front9Value: 18, back9Value: 21, birdieCount: 3 }),
        entrant({ memberId: "b", dayValue: 38, front9Value: 19, back9Value: 20, birdieCount: 3 }),
      ],
      totalPotPence: 1_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    }).filter((r) => r.divisionName === "Most Birdies");
    expect(rows.length).toBe(2);
    expect(rows[0].payoutAmountPence + rows[1].payoutAmountPence).toBe(200);
  });

  it("tie on best overall splits payout", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 40, front9Value: 18, back9Value: 22, birdieCount: 1 }),
        entrant({ memberId: "b", dayValue: 40, front9Value: 20, back9Value: 20, birdieCount: 2 }),
      ],
      totalPotPence: 1_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    }).filter((r) => r.divisionName === "Best Overall Score");
    expect(rows.length).toBe(2);
    expect(rows[0].payoutAmountPence + rows[1].payoutAmountPence).toBe(400);
  });

  it("no birdies rolls birdie payout into overall", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({ memberId: "a", dayValue: 42, front9Value: 21, back9Value: 21, birdieCount: 0 }),
        entrant({ memberId: "b", dayValue: 40, front9Value: 20, back9Value: 20, birdieCount: 0 }),
      ],
      totalPotPence: 1_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    });
    const birdieRows = rows.filter((r) => r.divisionName === "Most Birdies");
    const overallRows = rows.filter((r) => r.divisionName === "Best Overall Score");
    expect(birdieRows.length).toBe(0);
    expect(overallRows.reduce((s, r) => s + r.payoutAmountPence, 0)).toBe(600);
    expect(rows.some((r) => String(r.calculationNote ?? "").includes("birdie prize rolled"))).toBe(true);
  });

  it("guest can win splitter category", () => {
    const rows = allocateSplitterPotPence({
      entrants: [
        entrant({ memberId: "m1", dayValue: 38, front9Value: 19, back9Value: 19, birdieCount: 1 }),
        entrant({
          guestId: "g1",
          dayValue: 40,
          front9Value: 20,
          back9Value: 20,
          birdieCount: 2,
          sortOrder: "high_wins",
        }),
      ],
      totalPotPence: 1_000,
      eventFormat: "stableford",
      birdieFallbackToOverall: true,
    });
    expect(rows.some((r) => r.divisionName === "Best Overall Score" && r.guestId === "g1")).toBe(true);
  });
});
