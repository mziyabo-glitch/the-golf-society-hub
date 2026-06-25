import { describe, expect, it } from "vitest";
import {
  formatTeeSheetPublishValidationMessage,
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
