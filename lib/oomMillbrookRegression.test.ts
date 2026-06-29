import { describe, expect, it } from "vitest";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventEntry, JointEventSociety } from "@/lib/db_supabase/jointEventTypes";
import {
  buildJointFullFieldOomEntrants,
  buildOomScoringDebugRows,
  hydrateDayPointsFromCrossSocietyResults,
} from "@/lib/oomJointField";
import {
  calculateFieldPositionsAndMemberOomPoints,
  getAveragedOOMPoints,
} from "@/lib/oomMemberOnlyScoring";
import { buildEventResultInputsFromLeaderboard } from "@/lib/scoring/publishFromLeaderboard";
import { buildPublishOomEligibilityResolver } from "@/lib/oomPublishEligibility";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

const M4 = "society-m4";
const ZGS = "society-zgs";

const MILLBROOK_SOCIETIES: JointEventSociety[] = [
  {
    event_society_id: "es-m4",
    society_id: M4,
    society_name: "Mashonaland Four",
    role: "host",
    has_society_oom: true,
    society_oom_name: "M4 OOM",
  },
  {
    event_society_id: "es-zgs",
    society_id: ZGS,
    society_name: "Zimbabwe Golf Society",
    role: "participant",
    has_society_oom: true,
    society_oom_name: "ZGS OOM",
  },
];

/** GameBook stroke play NET results — OOM 4 The Millbrook, PAR 74 White tees. */
const MILLBROOK_GAMEBOOK_NET: {
  key: string;
  name: string;
  teeSheetName?: string;
  net: number;
  society: typeof M4 | typeof ZGS;
}[] = [
  { key: "makurumure", name: "K J Makurumure", net: 70, society: M4 },
  { key: "gorejena", name: "Augustine Gorejena", teeSheetName: "Gorejena Farai", net: 73, society: M4 },
  { key: "mokom", name: "Terence Mokom", net: 73, society: M4 },
  { key: "mokoena", name: "Mpho Mokoena", net: 74, society: M4 },
  { key: "muchando", name: "Jade Muchando", net: 75, society: ZGS },
  { key: "mash", name: "Simba Mash", net: 75, society: M4 },
  { key: "ndlovu", name: "Tony Ndlovu", net: 75, society: M4 },
  { key: "nyoni", name: "David Nyoni", net: 76, society: M4 },
  { key: "ganga", name: "Arthur Ganga", net: 77, society: M4 },
  { key: "nyasulu", name: "Bernie Nyasulu", net: 77, society: ZGS },
  { key: "guda", name: "Edward Guda", net: 79, society: M4 },
  { key: "alfazema", name: "Aulia Alfazema", net: 79, society: ZGS },
  { key: "nyemba", name: "TonKennedy Nyemba", net: 79, society: M4 },
  { key: "nhavira", name: "Sidney Nhavira", net: 80, society: ZGS },
  { key: "zikwature", name: "Tank Zikwature", net: 80, society: M4 },
  { key: "kudenga", name: "Ziv Kudenga", net: 80, society: ZGS },
  { key: "chiposi", name: "Tatenda Chiposi", net: 80, society: M4 },
  { key: "chinyadza", name: "Itai Chinyadza", net: 80, society: M4 },
  { key: "handiseni", name: "Micheal D Handiseni", net: 80, society: ZGS },
  { key: "makoni", name: "Pam Makoni", net: 81, society: M4 },
  { key: "chigwedere", name: "Noble Chigwedere", net: 81, society: ZGS },
  { key: "konzvo", name: "Marshal Konzvo", net: 81, society: M4 },
  { key: "moyo", name: "Tawanda Moyo", net: 82, society: ZGS },
  { key: "govera", name: "Mandela Govera", net: 82, society: M4 },
  { key: "fundira", name: "Fungai Fundira", net: 82, society: M4 },
  { key: "useya", name: "Fungayi Useya", net: 84, society: ZGS },
  { key: "taingwa", name: "Isaya Taingwa", net: 85, society: M4 },
  { key: "mtape", name: "Phanuel Mtape", net: 85, society: ZGS },
  { key: "govere", name: "Don Govere", net: 85, society: M4 },
  { key: "pinks", name: "Ian Pinks", net: 86, society: ZGS },
  { key: "adegbola", name: "Biyi Adegbõla", net: 86, society: M4 },
  { key: "sagiya", name: "Alf Sagiya", net: 86, society: ZGS },
];

function millbrookMembers(): MemberDoc[] {
  return MILLBROOK_GAMEBOOK_NET.map((p) => ({
    id: `member-${p.key}`,
    society_id: p.society,
    name: p.teeSheetName ?? p.name,
    displayName: p.name,
  }));
}

function millbrookJointEntries(): JointEventEntry[] {
  return MILLBROOK_GAMEBOOK_NET.map((p, i) => ({
    event_entry_id: `entry-${p.key}`,
    player_id: `member-${p.key}`,
    player_name: p.teeSheetName ?? p.name,
    tee_id: null,
    tee_name: "White",
    status: "confirmed",
    pairing_group: Math.floor(i / 4) + 1,
    pairing_position: (i % 4) + 1,
    is_scoring: true,
    society_memberships: [p.society],
    eligibility: [
      {
        society_id: M4,
        is_eligible_for_society_results: true,
        is_eligible_for_society_oom: true,
        manual_override_reason: null,
      },
      {
        society_id: ZGS,
        is_eligible_for_society_results: true,
        is_eligible_for_society_oom: true,
        manual_override_reason: null,
      },
    ],
  }));
}

function millbrookPlayerList(extraGuests: { id: string; name: string; net: number }[] = []) {
  const members = millbrookMembers();
  const societyIdToName = new Map([
    [M4, "M4"],
    [ZGS, "ZGS"],
  ]);
  const mergedIds = [
    ...members.map((m) => m.id),
    ...extraGuests.map((g) => `guest-${g.id}`),
  ];
  const entrants = buildJointFullFieldOomEntrants({
    mergedCandidateIds: mergedIds,
    allParticipatingMembers: members,
    societyIdToName,
    activeSocietyId: M4,
    participatingSocieties: MILLBROOK_SOCIETIES,
    jointEntries: millbrookJointEntries(),
    guestById: new Map(extraGuests.map((g) => [g.id, { name: g.name }])),
  });
  const withScores = entrants.map((e) => {
    if (e.memberId.startsWith("guest-")) {
      const gid = e.memberId.slice("guest-".length);
      const g = extraGuests.find((x) => x.id === gid);
      return { ...e, dayPoints: g ? String(g.net) : "" };
    }
    const p = MILLBROOK_GAMEBOOK_NET.find((x) => `member-${x.key}` === e.memberId);
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

describe("Millbrook Gorejena identity (tee sheet vs GameBook)", () => {
  it("merges Gorejena Farai and Augustine Gorejena member rows for joint dedupe", async () => {
    const { dedupeJointMembers } = await import("@/lib/jointPersonDedupe");
    const societyIdToName = new Map([[M4, "M4"], [ZGS, "ZGS"]]);
    const members: MemberDoc[] = [
      { id: "m-farai", society_id: M4, name: "Gorejena Farai" },
      { id: "m-augustine", society_id: M4, name: "Augustine Gorejena" },
    ];
    const deduped = dedupeJointMembers(members, societyIdToName);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]!.mergedMemberIds.sort()).toEqual(["m-augustine", "m-farai"]);
  });
});

describe("Millbrook OOM 4 regression (GameBook NET, joint M4/ZGS)", () => {
  it("full field NET order matches GameBook (lowest net wins; ties share position)", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(millbrookPlayerList(), "low_wins");
    const ranked = scored
      .filter((p) => p.dayPoints.trim() !== "")
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || a.memberName.localeCompare(b.memberName));
    expect(ranked.map((p) => parseInt(p.dayPoints, 10))).toEqual(MILLBROOK_GAMEBOOK_NET.map((p) => p.net));
    expect(ranked[0]!.memberName).toBe("K J Makurumure");
    expect(ranked[0]!.position).toBe(1);
    expect(ranked[ranked.length - 1]!.position).toBe(30);
    const tied73 = ranked.filter((p) => p.dayPoints === "73");
    expect(tied73.map((p) => p.position)).toEqual([2, 2]);
    const tied80 = ranked.filter((p) => p.dayPoints === "80");
    expect(tied80).toHaveLength(6);
    expect(new Set(tied80.map((p) => p.position))).toEqual(new Set([14]));
  });

  it("M4 OOM: Gorejena Farai (Augustine Gorejena) at 73 shares 2nd-place member OOM with Mokom", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(millbrookPlayerList(), "low_wins");
    const makurumure = scored.find((p) => p.memberId === "member-makurumure")!;
    const gorejena = scored.find((p) => p.memberId === "member-gorejena")!;
    const mokom = scored.find((p) => p.memberId === "member-mokom")!;

    expect(makurumure.position).toBe(1);
    expect(makurumure.oomPoints).toBe(25);

    expect(gorejena.memberName).toBe("Gorejena Farai");
    expect(gorejena.isOomEligible).toBe(true);
    expect(gorejena.position).toBe(2);
    expect(gorejena.oomPoints).toBeCloseTo(getAveragedOOMPoints(2, 2));

    expect(mokom.position).toBe(2);
    expect(mokom.oomPoints).toBeCloseTo(getAveragedOOMPoints(2, 2));
    expect(mokom.oomPoints).toBeCloseTo(16.5);
  });

  it("guest with best net is position 1 but M4 member Makurumure keeps 25 OOM points", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(
      millbrookPlayerList([{ id: "g1", name: "Pro Guest", net: 68 }]),
      "low_wins",
    );
    const guest = scored.find((p) => p.memberId === "guest-g1")!;
    const makurumure = scored.find((p) => p.memberName === "K J Makurumure")!;
    expect(guest.position).toBe(1);
    expect(guest.oomPoints).toBe(0);
    expect(makurumure.position).toBe(2);
    expect(makurumure.oomPoints).toBe(25);
  });

  it("six-way tie at net 80 shares field position 14; M4 at 80 are member ranks 11+ (0 OOM after Gorejena in M4 top 10)", () => {
    const scored = calculateFieldPositionsAndMemberOomPoints(millbrookPlayerList(), "low_wins");
    const at80 = scored.filter((p) => p.dayPoints === "80");
    expect(at80).toHaveLength(6);
    expect(new Set(at80.map((p) => p.position))).toEqual(new Set([14]));

    const m4At80 = at80.filter((p) => p.societyId === M4);
    expect(m4At80).toHaveLength(3);
    for (const p of m4At80) {
      expect(p.oomPoints).toBe(0);
    }
    for (const p of at80.filter((x) => x.societyId === ZGS)) {
      expect(p.oomPoints).toBe(0);
    }
  });

  it("publish path uses member-only OOM for strokeplay_net (not full-field rank slots)", () => {
    const members = millbrookMembers();
    const membersById = new Map(members.map((m) => [m.id, m]));
    const resolve = buildPublishOomEligibilityResolver({
      activeSocietyId: M4,
      participatingSocieties: MILLBROOK_SOCIETIES,
      jointEntries: millbrookJointEntries(),
      membersById,
    });

    const rows: LeaderboardRow[] = MILLBROOK_GAMEBOOK_NET.map((p, i) => ({
      player_id: `member-${p.key}`,
      rank: i + 1,
      tie_size: 1,
      gross_total: p.net + 10,
      net_total: p.net,
      stableford_points: 0,
      holes_played: 18,
      expected_holes: 18,
      round_complete: true,
      eligible_for_primary_rank: true,
      course_handicap: 10,
      playing_handicap: 10,
    }));

    const guestRow: LeaderboardRow = {
      player_id: "guest-g1",
      rank: 1,
      tie_size: 1,
      gross_total: 78,
      net_total: 68,
      stableford_points: 0,
      holes_played: 18,
      expected_holes: 18,
      round_complete: true,
      eligible_for_primary_rank: true,
      course_handicap: 10,
      playing_handicap: 10,
    };
    const board = [guestRow, ...rows.map((r) => ({ ...r, rank: r.rank + 1 }))];

    const out = buildEventResultInputsFromLeaderboard("strokeplay_net", board, true, resolve);
    const makurumure = out.find((r) => r.member_id === "member-makurumure")!;
    const gorejena = out.find((r) => r.member_id === "member-gorejena")!;
    expect(makurumure.points).toBe(25);
    expect(gorejena.points).toBeCloseTo(getAveragedOOMPoints(2, 2));
    expect(makurumure.day_value).toBe(70);
  });
});

describe("hydrateDayPointsFromCrossSocietyResults", () => {
  it("fills missing scores from another society's persisted results", () => {
    const entrants = [
      {
        memberId: "member-gorejena",
        memberName: "Augustine Gorejena",
        dayPoints: "",
        isOomEligible: false,
        societyId: ZGS,
      },
    ];
    const members = millbrookMembers();
    const memberById = new Map(members.map((m) => [m.id, m]));
    const hydrated = hydrateDayPointsFromCrossSocietyResults(
      entrants,
      [
        {
          id: "r1",
          event_id: "ev",
          society_id: ZGS,
          member_id: "member-gorejena",
          day_value: 73,
          points: 0,
          position: 2,
        },
      ],
      memberById,
    );
    expect(hydrated[0]!.dayPoints).toBe("73");
  });
});

describe("buildOomScoringDebugRows", () => {
  it("includes eligibility and society for each scored entrant", () => {
    const rows = buildOomScoringDebugRows([
      {
        memberId: "m1",
        memberName: "A",
        dayPoints: "72",
        position: 1,
        oomPoints: 25,
        isOomEligible: true,
        societyId: M4,
      },
    ]);
    expect(rows[0]).toMatchObject({
      name: "A",
      netScore: 72,
      fieldPosition: 1,
      isOomEligible: true,
      societyId: M4,
      oomPoints: 25,
    });
  });
});
