import { describe, expect, it } from "vitest";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  buildOomScoringDebugRows,
  buildStandardFullFieldOomEntrants,
  logOomScoringBreakdown,
} from "@/lib/oomJointField";
import {
  calculateFieldPositionsAndMemberOomPoints,
  getAveragedOOMPoints,
} from "@/lib/oomMemberOnlyScoring";
import { buildEventResultInputsFromLeaderboard } from "@/lib/scoring/publishFromLeaderboard";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

/** Zambezi Golf Society (ZGS) — host for OOM 4 Morley Hayes. */
const ZGS = "society-zgs";

/** Morley Hayes Manor Course, White tees — par 72 (matches event `par` / GameBook stroke play NET). */
export const MORLEY_HAYES_MANOR_PAR = 72;

/**
 * GameBook stroke play NET — Morley Hayes Manor Course, White tees.
 * BW visitors are `event_guests` (0 ZGS OOM); ZGS members earn society OOM only.
 */
const MORLEY_HAYES_GAMEBOOK: {
  key: string;
  name: string;
  net: number;
  hcp: number;
  kind: "member" | "guest";
}[] = [
  { key: "gumbura", name: "Bill Gumbura", net: 69, hcp: 23, kind: "guest" },
  { key: "mtandwa", name: "Andbye Mtandwa", net: 70, hcp: 26, kind: "guest" },
  { key: "handiseni", name: "Micheal D Handiseni", net: 71, hcp: 16, kind: "member" },
  { key: "zinhu", name: "Innocent Zinhu", net: 71, hcp: 24, kind: "guest" },
  { key: "sagiya", name: "Alf Sagiya", net: 71, hcp: 29, kind: "member" },
  { key: "fundira", name: "Don Fundira", net: 72, hcp: 25, kind: "member" },
  { key: "mharapara", name: "Tinaye Mharapara", net: 73, hcp: 14, kind: "guest" },
  { key: "galloway", name: "Tony Galloway", net: 74, hcp: 19, kind: "member" },
  { key: "kudenga", name: "Ziv Kudenga", net: 75, hcp: 18, kind: "member" },
  { key: "mataba", name: "Amos Mataba", net: 75, hcp: 23, kind: "member" },
  { key: "ffundira", name: "Fungai Fundira", net: 76, hcp: 6, kind: "member" },
  { key: "sibanda", name: "David Sibanda", net: 76, hcp: 9, kind: "member" },
  { key: "mandaza", name: "Ashton Sugarboy Mandaza", net: 76, hcp: 12, kind: "member" },
  { key: "musarurwa", name: "Adventure Musarurwa", net: 76, hcp: 19, kind: "member" },
  { key: "chinyadza", name: "Itai Chinyadza", net: 76, hcp: 22, kind: "member" },
  { key: "padya", name: "Dennis Padya", net: 77, hcp: 14, kind: "member" },
  { key: "moyo", name: "Tawanda Moyo", net: 77, hcp: 29, kind: "member" },
  { key: "gapara", name: "Justin Gapara", net: 78, hcp: 10, kind: "member" },
  { key: "ravu", name: "Rob Ravu", net: 78, hcp: 12, kind: "guest" },
  { key: "govera", name: "Mandela Govera", net: 78, hcp: 20, kind: "member" },
  { key: "mudonhi", name: "Martin Mudonhi", net: 79, hcp: 24, kind: "guest" },
  { key: "senah", name: "Anotida Senah", net: 79, hcp: 24, kind: "member" },
  { key: "mbwanda", name: "Gari Mbwanda", net: 80, hcp: 19, kind: "member" },
  { key: "phiri", name: "Ashley Phiri A", net: 80, hcp: 27, kind: "member" },
  { key: "mugwagwa", name: "Farai Mugwagwa", net: 81, hcp: 22, kind: "member" },
  { key: "chitokomere", name: "Edmore Chitokomere", net: 81, hcp: 29, kind: "guest" },
];

function gameBookNetsInRankOrder(): number[] {
  return [...MORLEY_HAYES_GAMEBOOK]
    .sort((a, b) => a.net - b.net || a.name.localeCompare(b.name))
    .map((p) => p.net);
}

function morleyMembers(): MemberDoc[] {
  return MORLEY_HAYES_GAMEBOOK.filter((p) => p.kind === "member").map((p) => ({
    id: `member-${p.key}`,
    society_id: ZGS,
    name: p.name,
  }));
}

function morleyGuests() {
  return MORLEY_HAYES_GAMEBOOK.filter((p) => p.kind === "guest").map((p) => ({
    id: p.key,
    name: p.name,
    net: p.net,
  }));
}

function morleyPlayerList() {
  const guests = morleyGuests();
  const members = morleyMembers();
  const mergedIds = [
    ...members.map((m) => m.id),
    ...guests.map((g) => `guest-${g.id}`),
  ];
  const entrants = buildStandardFullFieldOomEntrants({
    mergedCandidateIds: mergedIds,
    members,
    activeSocietyId: ZGS,
    guestById: new Map(guests.map((g) => [g.id, { name: g.name }])),
  });
  const byKey = new Map(MORLEY_HAYES_GAMEBOOK.map((p) => [p.key, p]));
  const withScores = entrants.map((e) => {
    if (e.memberId.startsWith("guest-")) {
      const gid = e.memberId.slice("guest-".length);
      const g = byKey.get(gid);
      return { ...e, dayPoints: g ? String(g.net) : "" };
    }
    const key = e.memberId.slice("member-".length);
    const p = byKey.get(key);
    return { ...e, dayPoints: p ? String(p.net) : "" };
  });
  return withScores.map((p) => ({
    memberId: p.memberId,
    memberName: p.memberName,
    dayPoints: p.dayPoints,
    isOomEligible: p.isOomEligible,
    societyId: p.societyId,
  }));
}

function scoreMorley(activeSocietyId = ZGS) {
  const list = morleyPlayerList();
  const scored = calculateFieldPositionsAndMemberOomPoints(list, "low_wins");
  if (activeSocietyId !== ZGS) return scored;
  return scored;
}

describe("Morley Hayes Manor Course (par / NET source)", () => {
  it("uses par 72 White tees for Manor Course (event metadata; OOM ranks GameBook NET day_value)", () => {
    expect(MORLEY_HAYES_MANOR_PAR).toBe(72);
    expect(MORLEY_HAYES_GAMEBOOK.every((p) => Number.isInteger(p.net))).toBe(true);
  });
});

describe("Morley Hayes OOM regression (GameBook NET, ZGS + BW guests)", () => {
  it("full field NET order matches GameBook (lowest net wins; ties share position)", () => {
    const scored = scoreMorley();
    const ranked = scored
      .filter((p) => p.dayPoints.trim() !== "")
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.memberName.localeCompare(b.memberName));
    expect(ranked.map((p) => parseInt(p.dayPoints, 10))).toEqual(gameBookNetsInRankOrder());
    expect(ranked[0]!.memberName).toBe("Bill Gumbura");
    expect(ranked[0]!.position).toBe(1);
    const tied71 = ranked.filter((p) => p.dayPoints === "71");
    expect(tied71).toHaveLength(3);
    expect(new Set(tied71.map((p) => p.position))).toEqual(new Set([3]));
    const tied76 = ranked.filter((p) => p.dayPoints === "76");
    expect(tied76).toHaveLength(5);
    expect(new Set(tied76.map((p) => p.position))).toEqual(new Set([11]));
  });

  it("BW guest Bill Gumbura leads field at 69 but earns 0 ZGS OOM", () => {
    const scored = scoreMorley();
    const bill = scored.find((p) => p.memberId === "guest-gumbura")!;
    expect(bill.position).toBe(1);
    expect(bill.isOomEligible).toBe(false);
    expect(bill.oomPoints).toBe(0);
  });

  it("ZGS OOM: Handiseni and Sagiya at 71 share 1st member OOM (21.5) after BW guests ahead in field", () => {
    const scored = scoreMorley();
    const handiseni = scored.find((p) => p.memberId === "member-handiseni")!;
    const sagiya = scored.find((p) => p.memberId === "member-sagiya")!;
    const zinhu = scored.find((p) => p.memberId === "guest-zinhu")!;

    expect(handiseni.position).toBe(3);
    expect(sagiya.position).toBe(3);
    expect(zinhu.position).toBe(3);
    expect(zinhu.oomPoints).toBe(0);

    expect(handiseni.oomPoints).toBeCloseTo(getAveragedOOMPoints(1, 2));
    expect(sagiya.oomPoints).toBeCloseTo(handiseni.oomPoints);
    expect(handiseni.oomPoints).toBeCloseTo(21.5);
  });

  it("guest Mharapara at 73 affects field position; Galloway (ZGS) keeps member OOM slot 4", () => {
    const scored = scoreMorley();
    const mharapara = scored.find((p) => p.memberId === "guest-mharapara")!;
    const galloway = scored.find((p) => p.memberId === "member-galloway")!;
    expect(mharapara.position).toBe(7);
    expect(mharapara.oomPoints).toBe(0);
    expect(galloway.position).toBe(8);
    expect(galloway.oomPoints).toBe(12);
  });

  it("five-way tie at net 76: field position 11; ZGS members share member OOM ranks 7–11 (2.6 each)", () => {
    const scored = scoreMorley();
    const at76 = scored.filter((p) => p.dayPoints === "76");
    expect(at76).toHaveLength(5);
    expect(new Set(at76.map((p) => p.position))).toEqual(new Set([11]));
    const zgsAt76 = at76.filter((p) => p.isOomEligible);
    expect(zgsAt76).toHaveLength(5);
    for (const p of zgsAt76) {
      expect(p.oomPoints).toBeCloseTo(getAveragedOOMPoints(7, 5));
      expect(p.oomPoints).toBeCloseTo(2.6);
    }
  });

  it("guest Ravu at 78 ties field; Gapara and Govera (ZGS) share position 18 with 0 OOM beyond top 10", () => {
    const scored = scoreMorley();
    const ravu = scored.find((p) => p.memberId === "guest-ravu")!;
    const gapara = scored.find((p) => p.memberId === "member-gapara")!;
    const govera = scored.find((p) => p.memberId === "member-govera")!;
    expect(ravu.position).toBe(18);
    expect(ravu.oomPoints).toBe(0);
    expect(gapara.position).toBe(18);
    expect(govera.position).toBe(18);
    expect(gapara.oomPoints).toBe(0);
    expect(govera.oomPoints).toBe(0);
  });

  it("emit debug rows with player, NET, position, eligibility, society, and OOM points", () => {
    const scored = scoreMorley();
    const rows = buildOomScoringDebugRows(
      scored.map((p) => ({
        memberId: p.memberId,
        memberName: p.memberName,
        dayPoints: p.dayPoints,
        position: p.position,
        oomPoints: p.oomPoints,
        isOomEligible: p.isOomEligible,
        societyId: p.societyId,
      })),
    );
    expect(rows.length).toBe(26);
    const bill = rows.find((r) => r.name === "Bill Gumbura")!;
    expect(bill).toMatchObject({
      netScore: 69,
      fieldPosition: 1,
      isOomEligible: false,
      oomPoints: 0,
    });
    const handiseni = rows.find((r) => r.name === "Micheal D Handiseni")!;
    expect(handiseni).toMatchObject({
      netScore: 71,
      fieldPosition: 3,
      isOomEligible: true,
      societyId: ZGS,
      oomPoints: 21.5,
    });
    logOomScoringBreakdown("morley-hayes-regression", rows, {
      par: MORLEY_HAYES_MANOR_PAR,
      format: "strokeplay_net",
    });
  });

  it("publish path uses member-only OOM from NET totals (not gross / stableford / tee-sheet order)", () => {
    const members = morleyMembers();
    const membersById = new Map(members.map((m) => [m.id, m]));
    const board: LeaderboardRow[] = MORLEY_HAYES_GAMEBOOK.map((p, i) => {
      const player_id = p.kind === "guest" ? `guest-${p.key}` : `member-${p.key}`;
      return {
        player_id,
        rank: i + 1,
        tie_size: 1,
        gross_total: p.net + p.hcp,
        net_total: p.net,
        stableford_points: 0,
        holes_played: 18,
        expected_holes: 18,
        round_complete: true,
        eligible_for_primary_rank: true,
        course_handicap: p.hcp,
        playing_handicap: p.hcp,
      };
    });

    const resolve = (playerId: string) => {
      if (playerId.startsWith("guest-")) return false;
      const m = membersById.get(playerId);
      return m?.society_id === ZGS;
    };

    const out = buildEventResultInputsFromLeaderboard("strokeplay_net", board, true, resolve);
    const handiseni = out.find((r) => r.member_id === "member-handiseni")!;
    const sagiya = out.find((r) => r.member_id === "member-sagiya")!;
    const billGuest = out.find((r) => r.member_id === "guest-gumbura")!;
    expect(billGuest.points).toBe(0);
    expect(billGuest.day_value).toBe(69);
    expect(handiseni.points).toBeCloseTo(21.5);
    expect(sagiya.points).toBeCloseTo(21.5);
    expect(handiseni.day_value).toBe(71);
  });
});
