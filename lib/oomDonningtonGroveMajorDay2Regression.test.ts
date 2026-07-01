import { describe, expect, it } from "vitest";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import {
  buildMajorDayOomDebugRows,
  logMajorDayOomBreakdown,
} from "@/lib/majorDayOomScoring";
import { getOomDaySortOrder } from "@/lib/oomEventClassification";
import {
  buildStandardFullFieldOomEntrants,
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

const ZGS = "society-zgs";
const PAR = 72;

/** GameBook Day 2 Stableford NET — rank by Today column (day-only, not cumulative). */
const DAY2_GAMEBOOK: {
  key: string;
  name: string;
  today: string;
  todayNum: number;
  gameBookPos: number;
  kind: "member" | "guest";
}[] = [
  { key: "musarurwa", name: "Adventure Musarurwa", today: "-6", todayNum: -6, gameBookPos: 1, kind: "member" },
  { key: "sibanda", name: "David Sibanda", today: "E", todayNum: 0, gameBookPos: 2, kind: "member" },
  { key: "fundira", name: "Don Fundira", today: "-4", todayNum: -4, gameBookPos: 3, kind: "member" },
  { key: "chikwanda", name: "Elliott Chikwanda", today: "-2", todayNum: -2, gameBookPos: 4, kind: "guest" },
  { key: "ndlovu", name: "Tony Ndlovu", today: "-1", todayNum: -1, gameBookPos: 5, kind: "member" },
  { key: "mokoena", name: "Mpho Mokoena", today: "-3", todayNum: -3, gameBookPos: 6, kind: "member" },
  { key: "sagiya", name: "Alf Sagiya", today: "E", todayNum: 0, gameBookPos: 7, kind: "member" },
  { key: "kadungure", name: "Tarisai Kadungure", today: "E", todayNum: 0, gameBookPos: 8, kind: "guest" },
  { key: "pinks", name: "Ian Pinks", today: "-5", todayNum: -5, gameBookPos: 9, kind: "member" },
  { key: "moyo", name: "Tawanda Moyo", today: "-1", todayNum: -1, gameBookPos: 10, kind: "member" },
  { key: "ravu", name: "Rob Ravu", today: "+2", todayNum: 2, gameBookPos: 11, kind: "guest" },
  { key: "padya", name: "Dennis Padya", today: "+2", todayNum: 2, gameBookPos: 12, kind: "member" },
  { key: "prince", name: "Prince Z", today: "+3", todayNum: 3, gameBookPos: 13, kind: "guest" },
  { key: "gapara", name: "Justin Gapara", today: "+4", todayNum: 4, gameBookPos: 14, kind: "member" },
  { key: "chigwedere", name: "Noble Chigwedere", today: "+1", todayNum: 1, gameBookPos: 15, kind: "member" },
  { key: "malunga", name: "Derick Malunga", today: "+6", todayNum: 6, gameBookPos: 16, kind: "member" },
  { key: "mharapara", name: "Tinaye Mharapara", today: "+4", todayNum: 4, gameBookPos: 17, kind: "guest" },
  { key: "makurumure", name: "K J Makurumure", today: "+3", todayNum: 3, gameBookPos: 18, kind: "member" },
  { key: "tizirai", name: "George Tiziraichapwana", today: "+5", todayNum: 5, gameBookPos: 19, kind: "member" },
  { key: "banda", name: "Shenton Banda", today: "+6", todayNum: 6, gameBookPos: 20, kind: "guest" },
  { key: "chinyadza", name: "Itai Chinyadza", today: "+9", todayNum: 9, gameBookPos: 21, kind: "member" },
  { key: "gorejena", name: "Augustine Gorejena", today: "+6", todayNum: 6, gameBookPos: 22, kind: "guest" },
  { key: "byron", name: "Byron Fundira", today: "+5", todayNum: 5, gameBookPos: 23, kind: "guest" },
  { key: "mbwanda", name: "Gari Mbwanda", today: "+4", todayNum: 4, gameBookPos: 24, kind: "member" },
  { key: "kashora", name: "Robson Kashora", today: "+4", todayNum: 4, gameBookPos: 25, kind: "guest" },
];

function groveMembers(): MemberDoc[] {
  return DAY2_GAMEBOOK.filter((p) => p.kind === "member").map((p) => ({
    id: `member-${p.key}`,
    society_id: ZGS,
    name: p.name,
  }));
}

function grovePlayerList() {
  const guests = DAY2_GAMEBOOK.filter((p) => p.kind === "guest").map((p) => ({
    id: p.key,
    name: p.name,
  }));
  const members = groveMembers();
  const entrants = buildStandardFullFieldOomEntrants({
    mergedCandidateIds: [
      ...members.map((m) => m.id),
      ...guests.map((g) => `guest-${g.id}`),
    ],
    members,
    activeSocietyId: ZGS,
    guestById: new Map(guests.map((g) => [g.id, { name: g.name }])),
  });
  const byKey = new Map(DAY2_GAMEBOOK.map((p) => [p.key, p]));
  return entrants.map((e) => {
    const key = e.memberId.startsWith("guest-")
      ? e.memberId.slice("guest-".length)
      : e.memberId.slice("member-".length);
    const p = byKey.get(key);
    return {
      memberId: e.memberId,
      memberName: e.memberName,
      dayPoints: p ? String(p.todayNum) : "",
      isOomEligible: e.isOomEligible,
      societyId: e.societyId,
    };
  });
}

describe("Donnington Grove Major Day 2 (Stableford NET Today)", () => {
  it("uses low_wins on Today for major stableford NET OOM", () => {
    expect(getOomDaySortOrder("stableford", "major")).toBe("low_wins");
  });

  it("Musarurwa Today -6 leads Day 2 member OOM with 25 points", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(grovePlayerList(), "low_wins");
    const musarurwa = scored.find((p) => p.memberId === "member-musarurwa")!;
    expect(musarurwa.dayPoints).toBe("-6");
    expect(musarurwa.position).toBe(1);
    expect(musarurwa.oomPoints).toBe(25);
  });

  it("guest Chikwanda Today -2 does not take ZGS OOM slot; Pinks -5 is next member rank", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(grovePlayerList(), "low_wins");
    const chikwanda = scored.find((p) => p.memberId === "guest-chikwanda")!;
    const pinks = scored.find((p) => p.memberId === "member-pinks")!;
    expect(chikwanda.oomPoints).toBe(0);
    expect(pinks.oomPoints).toBe(18);
  });

  it("Ndlovu and Moyo both Today -1 share member OOM ranks", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(grovePlayerList(), "low_wins");
    const ndlovu = scored.find((p) => p.memberId === "member-ndlovu")!;
    const moyo = scored.find((p) => p.memberId === "member-moyo")!;
    expect(ndlovu.oomPoints).toBeCloseTo(getAveragedOOMPoints(5, 2));
    expect(moyo.oomPoints).toBeCloseTo(ndlovu.oomPoints);
  });

  it("publish uses net-to-par Today for day_value, not cumulative stableford_points or tournament rank", () => {
    const cumulativeRankMusarurwa = 8;
    const row: LeaderboardRow = {
      player_id: "member-musarurwa",
      rank: cumulativeRankMusarurwa,
      tie_size: 1,
      gross_total: 84,
      net_total: 66,
      stableford_points: 38,
      holes_played: 18,
      expected_holes: 18,
      round_complete: true,
      eligible_for_primary_rank: true,
      course_handicap: 18,
      playing_handicap: 18,
    };
    const meta = { classification: "major", par: PAR };
    expect(dayValueForPublishedResult("stableford", row, meta)).toBe(-6);

    const out = buildEventResultInputsFromLeaderboard(
      "stableford",
      [row],
      true,
      (id) => !id.startsWith("guest-"),
      "test-publish",
      meta,
    );
    expect(out[0]!.day_value).toBe(-6);
    expect(out[0]!.points).toBe(25);
    expect(out[0]!.position).toBe(1);
    expect(out[0]!.position).not.toBe(cumulativeRankMusarurwa);
  });

  it("emit major day debug rows with Today, Day 2 position, eligibility, and major points", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(grovePlayerList(), "low_wins");
    const rows = buildMajorDayOomDebugRows(
      scored.map((p) => {
        const gb = DAY2_GAMEBOOK.find(
          (x) =>
            (x.kind === "guest" ? `guest-${x.key}` : `member-${x.key}`) === p.memberId,
        );
        return {
          memberId: p.memberId,
          memberName: p.memberName,
          dayPoints: p.dayPoints,
          position: gb?.gameBookPos ?? p.position,
          oomPoints: p.oomPoints,
          isOomEligible: p.isOomEligible,
          societyId: p.societyId,
          tournamentPosition: (gb?.gameBookPos ?? 0) + 3,
        };
      }),
      { format: "stableford", classification: "major" },
    );
    expect(rows.length).toBe(25);
    const musarurwa = rows.find((r) => r.name === "Adventure Musarurwa")!;
    expect(musarurwa.todayScore).toBe(-6);
    expect(musarurwa.day2Position).toBe(1);
    expect(musarurwa.tournamentPosition).toBe(4);
    expect(musarurwa.majorPoints).toBe(25);
    logMajorDayOomBreakdown("donnington-grove-day2-regression", rows, {
      par: PAR,
      scoringSource: "day_today_not_cumulative",
    });
  });
});
