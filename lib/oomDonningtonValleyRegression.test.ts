import { describe, expect, it } from "vitest";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  buildMajorDayOomDebugRows,
  logMajorDayOomBreakdown,
} from "@/lib/majorDayOomScoring";
import { getOomDaySortOrder } from "@/lib/oomEventClassification";
import {
  buildOomScoringDebugRows,
  buildStandardFullFieldOomEntrants,
  logOomScoringBreakdown,
} from "@/lib/oomJointField";
import {
  calculateFieldPositionsAndMemberOomPoints,
  getAveragedOOMPoints,
} from "@/lib/oomMemberOnlyScoring";
import {
  buildEventResultInputsFromLeaderboard,
  dayValueForPublishedResult,
} from "@/lib/scoring/publishFromLeaderboard";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

/** Zambezi Golf Society (ZGS). */
const ZGS = "society-zgs";

/** Donnington Valley GC — par 71 (GameBook / event metadata). */
export const DONNINGTON_VALLEY_PAR = 71;

const DAY1_EVENT_NAME = "OOM 5 - Donnington Major Day 1";

/**
 * GameBook Day 1 Stableford NET — rank by Today column (day-only, not cumulative).
 * `net` = par + toPar. BW visitors are guests (0 ZGS OOM).
 * Derick Malunga (+6) excluded — round not finished on GameBook.
 */
const DONNINGTON_GAMEBOOK: {
  key: string;
  name: string;
  net: number;
  toPar: number;
  today: string;
  hcp: number;
  kind: "member" | "guest";
}[] = [
  { key: "musarurwa", name: "Adventure Musarurwa", net: 68, toPar: -3, today: "-3", hcp: 17, kind: "member" },
  { key: "sibanda", name: "David Sibanda", net: 69, toPar: -2, today: "-2", hcp: 8, kind: "member" },
  { key: "fundira", name: "Don Fundira", net: 71, toPar: 0, today: "E", hcp: 21, kind: "member" },
  { key: "ndlovu", name: "Tony Ndlovu", net: 74, toPar: 3, today: "+3", hcp: 20, kind: "member" },
  { key: "chikwanda", name: "Elliott Chikwanda", net: 74, toPar: 3, today: "+3", hcp: 16, kind: "guest" },
  { key: "sagiya", name: "Alf Sagiya", net: 75, toPar: 4, today: "+4", hcp: 26, kind: "member" },
  { key: "kadungure", name: "Tarisai Kadungure", net: 75, toPar: 4, today: "+4", hcp: 23, kind: "guest" },
  { key: "mokoena", name: "Mpho Mokoena", net: 75, toPar: 4, today: "+4", hcp: 19, kind: "member" },
  { key: "gapara", name: "Justin Gapara", net: 76, toPar: 5, today: "+5", hcp: 8, kind: "member" },
  { key: "prince", name: "Prince Z", net: 76, toPar: 5, today: "+5", hcp: 9, kind: "guest" },
  { key: "padya", name: "Dennis Padya", net: 76, toPar: 5, today: "+5", hcp: 13, kind: "member" },
  { key: "ravu", name: "Rob Ravu", net: 76, toPar: 5, today: "+5", hcp: 10, kind: "guest" },
  { key: "moyo", name: "Tawanda Moyo", net: 76, toPar: 5, today: "+5", hcp: 26, kind: "member" },
  { key: "pinks", name: "Ian Pinks", net: 76, toPar: 5, today: "+5", hcp: 17, kind: "member" },
  { key: "chigwedere", name: "Noble Chigwedere", net: 77, toPar: 6, today: "+6", hcp: 12, kind: "member" },
  { key: "makurumure", name: "K J Makurumure", net: 78, toPar: 7, today: "+7", hcp: 17, kind: "member" },
  { key: "mharapara", name: "Tinaye Mharapara", net: 78, toPar: 7, today: "+7", hcp: 11, kind: "guest" },
  { key: "chinyadza", name: "Itai Chinyadza", net: 79, toPar: 8, today: "+8", hcp: 19, kind: "member" },
  { key: "banda", name: "Shenton Banda", net: 79, toPar: 8, today: "+8", hcp: 8, kind: "guest" },
  { key: "tizirai", name: "George Tiziraichapwana", net: 79, toPar: 8, today: "+8", hcp: 22, kind: "member" },
  { key: "gorejena", name: "Augustine Gorejena", net: 80, toPar: 9, today: "+9", hcp: 13, kind: "guest" },
  { key: "byron", name: "Byron Fundira", net: 81, toPar: 10, today: "+10", hcp: 26, kind: "guest" },
  { key: "mandangu", name: "Max Mandangu", net: 82, toPar: 11, today: "+11", hcp: 11, kind: "guest" },
  { key: "mbwanda", name: "Gari Mbwanda", net: 82, toPar: 11, today: "+11", hcp: 19, kind: "member" },
];

function gameBookTodayInRankOrder(): number[] {
  return DONNINGTON_GAMEBOOK.map((p) => p.toPar);
}

function donningtonMembers(): MemberDoc[] {
  return DONNINGTON_GAMEBOOK.filter((p) => p.kind === "member").map((p) => ({
    id: `member-${p.key}`,
    society_id: ZGS,
    name: p.name,
  }));
}

function donningtonGuests() {
  return DONNINGTON_GAMEBOOK.filter((p) => p.kind === "guest").map((p) => ({
    id: p.key,
    name: p.name,
    today: p.today,
  }));
}

function donningtonPlayerList() {
  const guests = donningtonGuests();
  const members = donningtonMembers();
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
  const byKey = new Map(DONNINGTON_GAMEBOOK.map((p) => [p.key, p]));
  return entrants.map((e) => {
    const key = e.memberId.startsWith("guest-")
      ? e.memberId.slice("guest-".length)
      : e.memberId.slice("member-".length);
    const p = byKey.get(key);
    return {
      memberId: e.memberId,
      memberName: e.memberName,
      dayPoints: p ? String(p.toPar) : "",
      isOomEligible: e.isOomEligible,
      societyId: e.societyId,
    };
  });
}

describe("Donnington Valley (par / Today source)", () => {
  it("uses par 71; GameBook NET = par + toPar (Today column)", () => {
    expect(DONNINGTON_VALLEY_PAR).toBe(71);
    for (const p of DONNINGTON_GAMEBOOK) {
      expect(p.net).toBe(DONNINGTON_VALLEY_PAR + p.toPar);
    }
  });

  it("uses low_wins on Today for major stableford NET OOM Day 1", () => {
    expect(getOomDaySortOrder("stableford", "oom", { eventName: DAY1_EVENT_NAME })).toBe("low_wins");
  });
});

describe("Donnington Valley OOM regression (GameBook Today, ZGS + BW guests)", () => {
  it("full field Today order matches GameBook (24 finishers; Malunga excluded)", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const ranked = scored
      .filter((p) => p.dayPoints.trim() !== "")
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.memberName.localeCompare(b.memberName));
    expect(ranked).toHaveLength(24);
    expect(ranked.map((p) => parseInt(p.dayPoints, 10))).toEqual(gameBookTodayInRankOrder());
    expect(ranked[0]!.memberName).toBe("Adventure Musarurwa");
    expect(ranked[0]!.position).toBe(1);
    const tied4 = ranked.filter((p) => p.dayPoints === "4");
    expect(tied4).toHaveLength(3);
    expect(new Set(tied4.map((p) => p.position))).toEqual(new Set([6]));
    const tied5 = ranked.filter((p) => p.dayPoints === "5");
    expect(tied5).toHaveLength(6);
    expect(new Set(tied5.map((p) => p.position))).toEqual(new Set([9]));
  });

  it("Musarurwa leads on Today -3 with 25 ZGS OOM points", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const musarurwa = scored.find((p) => p.memberId === "member-musarurwa")!;
    expect(musarurwa.position).toBe(1);
    expect(musarurwa.oomPoints).toBe(25);
  });

  it("guest Chikwanda ties Ndlovu at +3 in field but earns 0 ZGS OOM; Ndlovu keeps 12", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const ndlovu = scored.find((p) => p.memberId === "member-ndlovu")!;
    const chikwanda = scored.find((p) => p.memberId === "guest-chikwanda")!;
    expect(ndlovu.position).toBe(4);
    expect(chikwanda.position).toBe(4);
    expect(chikwanda.oomPoints).toBe(0);
    expect(ndlovu.oomPoints).toBe(12);
  });

  it("guest Kadungure at +4 ties field; Sagiya and Mokoena share ZGS member OOM ranks 5–6 (9 each)", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const sagiya = scored.find((p) => p.memberId === "member-sagiya")!;
    const mokoena = scored.find((p) => p.memberId === "member-mokoena")!;
    const kadungure = scored.find((p) => p.memberId === "guest-kadungure")!;
    expect(kadungure.position).toBe(6);
    expect(kadungure.oomPoints).toBe(0);
    expect(sagiya.oomPoints).toBeCloseTo(getAveragedOOMPoints(5, 2));
    expect(mokoena.oomPoints).toBeCloseTo(9);
  });

  it("six-way tie at Today +5: four ZGS members share member OOM ranks 7–10 (3.25 each)", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const at5 = scored.filter((p) => p.dayPoints === "5");
    expect(at5).toHaveLength(6);
    const zgsAt5 = at5.filter((p) => p.isOomEligible);
    expect(zgsAt5).toHaveLength(4);
    for (const p of zgsAt5) {
      expect(p.oomPoints).toBeCloseTo(getAveragedOOMPoints(7, 4));
      expect(p.oomPoints).toBeCloseTo(3.25);
    }
  });

  it("guest Gorejena (GameBook Augustine Gorejena) at +9 earns 0 ZGS OOM", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const gorejena = scored.find((p) => p.memberId === "guest-gorejena")!;
    expect(gorejena.position).toBe(21);
    expect(gorejena.oomPoints).toBe(0);
  });

  it("emit major day debug rows with Today, Day 1 position, eligibility, and major points", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
    const rows = buildMajorDayOomDebugRows(
      scored.map((p) => ({
        memberId: p.memberId,
        memberName: p.memberName,
        dayPoints: p.dayPoints,
        position: p.position,
        oomPoints: p.oomPoints,
        isOomEligible: p.isOomEligible,
        societyId: p.societyId,
      })),
      { format: "stableford", classification: "oom", name: DAY1_EVENT_NAME },
    );
    expect(rows).toHaveLength(24);
    const musarurwa = rows.find((r) => r.name === "Adventure Musarurwa")!;
    expect(musarurwa.todayScore).toBe(-3);
    expect(musarurwa.day2Position).toBe(1);
    expect(musarurwa.majorPoints).toBe(25);
    logMajorDayOomBreakdown("donnington-valley-regression", rows, {
      par: DONNINGTON_VALLEY_PAR,
      scoringSource: "day_today_not_cumulative",
    });
  });

  it("emit standard debug rows with player, Today, position, eligibility, society, and OOM points", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(donningtonPlayerList(), "low_wins");
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
    expect(rows).toHaveLength(24);
    logOomScoringBreakdown("donnington-valley-regression", rows, {
      par: DONNINGTON_VALLEY_PAR,
      format: "stableford",
    });
  });

  it("publish path ranks by Today (net-to-par) with member-only OOM slots", () => {
    const members = donningtonMembers();
    const membersById = new Map(members.map((m) => [m.id, m]));
    const board: LeaderboardRow[] = DONNINGTON_GAMEBOOK.map((p, i) => ({
      player_id: p.kind === "guest" ? `guest-${p.key}` : `member-${p.key}`,
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
    }));
    const resolve = (playerId: string) => {
      if (playerId.startsWith("guest-")) return false;
      return membersById.get(playerId)?.society_id === ZGS;
    };
    const meta = { classification: "oom", par: DONNINGTON_VALLEY_PAR, eventName: DAY1_EVENT_NAME };
    const out = buildEventResultInputsFromLeaderboard("stableford", board, true, resolve, undefined, meta);
    const musarurwa = out.find((r) => r.member_id === "member-musarurwa")!;
    const chikwanda = out.find((r) => r.member_id === "guest-chikwanda")!;
    expect(musarurwa.points).toBe(25);
    expect(chikwanda.points).toBe(0);
    expect(musarurwa.day_value).toBe(-3);
    expect(dayValueForPublishedResult("stableford", board[0]!, meta)).toBe(-3);
  });
});
