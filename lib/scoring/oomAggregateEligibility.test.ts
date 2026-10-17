import { describe, expect, it } from "vitest";
import { buildOomEligibleEventIdSet, includeEventResultsInOomAggregate } from "@/lib/scoring/oomAggregateEligibility";

describe("includeEventResultsInOomAggregate", () => {
  it("counts when published even with gross rounds", () => {
    expect(
      includeEventResultsInOomAggregate({
        scoringResultsStatusRaw: "published",
        eventHasPersistedGrossRounds: true,
      }),
    ).toBe(true);
  });

  it("excludes draft when gross rounds exist", () => {
    expect(
      includeEventResultsInOomAggregate({
        scoringResultsStatusRaw: "draft",
        eventHasPersistedGrossRounds: true,
      }),
    ).toBe(false);
  });

  it("excludes reopened when gross rounds exist", () => {
    expect(
      includeEventResultsInOomAggregate({
        scoringResultsStatusRaw: "reopened",
        eventHasPersistedGrossRounds: true,
      }),
    ).toBe(false);
  });

  it("allows draft when no gross rounds (legacy manual)", () => {
    expect(
      includeEventResultsInOomAggregate({
        scoringResultsStatusRaw: "draft",
        eventHasPersistedGrossRounds: false,
      }),
    ).toBe(true);
  });
});

describe("buildOomEligibleEventIdSet", () => {
  it("marks only published when gross footprint exists", () => {
    const events = [
      { id: "a", scoring_results_status: "draft" },
      { id: "b", scoring_results_status: "published" },
    ];
    const gross = new Set(["a", "b"]);
    const set = buildOomEligibleEventIdSet(events, gross);
    expect(set.has("a")).toBe(false);
    expect(set.has("b")).toBe(true);
  });

  it("includes draft events without gross rows", () => {
    const events = [{ id: "x", scoring_results_status: "draft" }];
    const set = buildOomEligibleEventIdSet(events, new Set());
    expect(set.has("x")).toBe(true);
  });
});
