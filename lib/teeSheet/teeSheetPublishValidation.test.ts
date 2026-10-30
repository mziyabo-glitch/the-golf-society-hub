import { describe, expect, it } from "vitest";
import {
  formatTeeSheetPublishValidationMessage,
  publishEligibilityCheckSet,
  validateTeeSheetForPublish,
} from "@/lib/teeSheet/teeSheetPublishValidation";

const eligible = new Set(["m1", "m2"]);

function player(
  overrides: Partial<{
    id: string;
    name: string;
    gender: "male" | "female" | null;
    teeAssignment: "men" | "ladies" | null;
    handicapIndex: number | null;
    playingHandicap: number | null;
  }> = {},
) {
  return {
    id: "m1",
    name: "Player One",
    gender: "male" as const,
    teeAssignment: "men" as const,
    handicapIndex: 12,
    playingHandicap: 11,
    ...overrides,
  };
}

describe("validateTeeSheetForPublish", () => {
  it("accepts a valid sheet", () => {
    const result = validateTeeSheetForPublish({
      groups: [{ groupNumber: 1, players: [player()] }],
      eligiblePlayerIds: eligible,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("blocks empty groups", () => {
    const result = validateTeeSheetForPublish({ groups: [] });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/at least one player/i);
  });

  it("blocks unresolved tee policy", () => {
    const result = validateTeeSheetForPublish({
      groups: [{ groupNumber: 1, players: [player({ gender: null, teeAssignment: null, name: "TBC Guest" })] }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/TBC Guest/i);
  });

  it("blocks duplicate players", () => {
    const result = validateTeeSheetForPublish({
      groups: [
        { groupNumber: 1, players: [player({ id: "m1", name: "Ann" })] },
        { groupNumber: 2, players: [player({ id: "m1", name: "Ann" })] },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/appears in group/i);
  });

  it("blocks over-capacity groups", () => {
    const result = validateTeeSheetForPublish({
      groups: [
        {
          groupNumber: 1,
          players: [1, 2, 3, 4, 5].map((n) =>
            player({ id: `m${n}`, name: `P${n}`, handicapIndex: 10, playingHandicap: 9 }),
          ),
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/maximum 4/i);
  });

  it("blocks ineligible unpaid members", () => {
    const result = validateTeeSheetForPublish({
      groups: [{ groupNumber: 1, players: [player({ id: "unpaid", name: "Unpaid Pat" })] }],
      eligiblePlayerIds: eligible,
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/not tee-sheet eligible/i);
  });

  it("blocks missing PH when HI and tee are known", () => {
    const result = validateTeeSheetForPublish({
      groups: [
        {
          groupNumber: 1,
          players: [player({ name: "No PH", playingHandicap: null })],
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/missing a playing handicap/i);
  });

  it("warns about empty numbered groups", () => {
    const result = validateTeeSheetForPublish({
      groups: [
        { groupNumber: 1, players: [player()] },
        { groupNumber: 2, players: [] },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.warnings[0]).toMatch(/empty group slot/i);
  });

  it("formats combined validation message", () => {
    const message = formatTeeSheetPublishValidationMessage({
      ok: false,
      errors: ["Fix A"],
      warnings: ["Note B"],
    });
    expect(message).toContain("Fix A");
    expect(message).toContain("Note B");
  });
});

describe("publishEligibilityCheckSet (joint vs standard eligibility gate)", () => {
  it("skips the eligibility gate for joint events (returns undefined)", () => {
    // Regression: joint Millbrook publish was blocked because saved cross-society entries
    // (dual / participant / confirmed-but-not-paid players) are absent from the host-derived
    // eligible set. Joint membership is authoritative from saved entries, so the gate must skip.
    const set = publishEligibilityCheckSet({
      isJointEvent: true,
      eligiblePlayerIds: eligible,
    });
    expect(set).toBeUndefined();
  });

  it("enforces the eligible set for standard events", () => {
    const set = publishEligibilityCheckSet({
      isJointEvent: false,
      eligiblePlayerIds: eligible,
    });
    expect(set).toBe(eligible);
  });

  it("joint publish: a saved player outside the host eligible set still validates ok", () => {
    // Player 'zgs-captain' is a participant-society member saved into the joint tee sheet but
    // not present in the host candidate pool. With the gate skipped, publish is not blocked.
    const result = validateTeeSheetForPublish({
      groups: [{ groupNumber: 1, players: [player({ id: "zgs-captain", name: "David Sibanda" })] }],
      eligiblePlayerIds: publishEligibilityCheckSet({
        isJointEvent: true,
        eligiblePlayerIds: eligible,
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("standard publish: the same out-of-set player is still blocked as ineligible", () => {
    const result = validateTeeSheetForPublish({
      groups: [{ groupNumber: 1, players: [player({ id: "zgs-captain", name: "David Sibanda" })] }],
      eligiblePlayerIds: publishEligibilityCheckSet({
        isJointEvent: false,
        eligiblePlayerIds: eligible,
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/not tee-sheet eligible/i);
  });

  it("joint publish still blocks genuine problems (duplicates, capacity, tee policy, PH)", () => {
    const joint = publishEligibilityCheckSet({ isJointEvent: true, eligiblePlayerIds: eligible });
    const dup = validateTeeSheetForPublish({
      groups: [
        { groupNumber: 1, players: [player({ id: "x", name: "Ann" })] },
        { groupNumber: 2, players: [player({ id: "x", name: "Ann" })] },
      ],
      eligiblePlayerIds: joint,
    });
    expect(dup.ok).toBe(false);
    expect(dup.errors[0]).toMatch(/appears in group/i);

    const tbc = validateTeeSheetForPublish({
      groups: [{ groupNumber: 1, players: [player({ id: "y", gender: null, teeAssignment: null, name: "TBC" })] }],
      eligiblePlayerIds: joint,
    });
    expect(tbc.ok).toBe(false);
    expect(tbc.errors[0]).toMatch(/TBC/i);
  });
});
