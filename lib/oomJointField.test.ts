import { describe, expect, it } from "vitest";
import type { MemberDoc } from "@/lib/db_supabase/memberRepo";
import type { JointEventSociety } from "@/lib/db_supabase/jointEventTypes";
import {
  buildJointFullFieldOomEntrants,
  buildStandardFullFieldOomEntrants,
} from "@/lib/oomJointField";

const SOCIETY = "society-host";

describe("buildStandardFullFieldOomEntrants", () => {
  it("includes every event guest even when not in mergedCandidateIds", () => {
    const members: MemberDoc[] = [{ id: "m1", society_id: SOCIETY, name: "Alice Member" }];
    const guestById = new Map([
      ["g-bernie", { name: "Bernie Nyasulu" }],
      ["g-other", { name: "Pat Guest" }],
    ]);
    const entrants = buildStandardFullFieldOomEntrants({
      mergedCandidateIds: ["m1"],
      members,
      activeSocietyId: SOCIETY,
      guestById,
    });
    expect(entrants.map((e) => e.memberId).sort()).toEqual(
      ["guest-g-bernie", "guest-g-other", "m1"].sort(),
    );
    for (const g of entrants.filter((e) => e.memberId.startsWith("guest-"))) {
      expect(g.isOomEligible).toBe(false);
    }
    expect(entrants.find((e) => e.memberId === "m1")!.isOomEligible).toBe(true);
  });
});

describe("buildJointFullFieldOomEntrants", () => {
  const societies: JointEventSociety[] = [
    {
      event_society_id: "es1",
      society_id: SOCIETY,
      society_name: "Host",
      role: "host",
      has_society_oom: true,
      society_oom_name: "OOM",
    },
  ];

  it("includes every event guest from guestById for joint full-field ranking", () => {
    const members: MemberDoc[] = [{ id: "m1", society_id: SOCIETY, name: "Alice Member" }];
    const guestById = new Map([["nyasulu", { name: "Bernie Nyasulu" }]]);
    const entrants = buildJointFullFieldOomEntrants({
      mergedCandidateIds: ["m1"],
      allParticipatingMembers: members,
      societyIdToName: new Map([[SOCIETY, "Host"]]),
      activeSocietyId: SOCIETY,
      participatingSocieties: societies,
      jointEntries: [{ player_id: "m1", eligibility: [] }],
      guestById,
    });
    const bernie = entrants.find((e) => e.memberId === "guest-nyasulu");
    expect(bernie).toBeDefined();
    expect(bernie!.memberName).toBe("Bernie Nyasulu");
    expect(bernie!.isOomEligible).toBe(false);
  });
});
