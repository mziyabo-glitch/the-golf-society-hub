import { describe, expect, it, vi } from "vitest";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import { buildEventResultInputsFromLeaderboard, validateScoringPublishReadiness } from "@/lib/scoring/publishFromLeaderboard";
import { publishEventScoringResults, reopenEventScoringResults } from "@/lib/services/publishEventScoringService";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

function ctx(): EventScoringContext {
  return {
    eventId: "e1",
    societyId: "s1",
    name: "E",
    format: "stableford",
    rawFormat: "stableford",
    handicapAllowance: 0.95,
    teeSnapshot: { teeName: "W", courseRating: 72, slopeRating: 113, parTotal: 8 },
    holes: [
      { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
      { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
    ],
    players: [{ memberId: "a", displayName: "A", handicapIndex: 0, courseHandicap: 0, playingHandicap: 0 }],
  };
}

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  player_id: "p1",
  rank: 1,
  tie_size: 1,
  gross_total: 8,
  net_total: 8,
  stableford_points: 4,
  holes_played: 2,
  expected_holes: 2,
  round_complete: true,
  eligible_for_primary_rank: true,
  course_handicap: 0,
  playing_handicap: 0,
  ...over,
});

describe("validateScoringPublishReadiness", () => {
  it("blocks when no complete rounds", () => {
    const issues = validateScoringPublishReadiness([row({ round_complete: false, holes_played: 1 })], ctx());
    expect(issues.length).toBeGreaterThan(0);
  });

  it("passes with at least one complete round", () => {
    expect(validateScoringPublishReadiness([row({})], ctx())).toEqual([]);
  });
});

describe("buildEventResultInputsFromLeaderboard", () => {
  it("uses shared rank and averaged OOM points for ties (OOM event)", () => {
    const rows: LeaderboardRow[] = [
      row({ player_id: "a", rank: 1, tie_size: 2, stableford_points: 10 }),
      row({ player_id: "b", rank: 1, tie_size: 2, stableford_points: 10 }),
      row({ player_id: "c", rank: 3, tie_size: 1, stableford_points: 8 }),
    ];
    const out = buildEventResultInputsFromLeaderboard("stableford", rows, true);
    expect(out).toHaveLength(3);
    expect(out[0]!.position).toBe(1);
    expect(out[1]!.position).toBe(1);
    expect(out[0]!.points).toBeCloseTo(21.5);
    expect(out[1]!.points).toBeCloseTo(21.5);
    expect(out[2]!.position).toBe(3);
    expect(out[2]!.points).toBe(15);
  });

  it("writes zero OOM points when event is not OOM", () => {
    const out = buildEventResultInputsFromLeaderboard("stableford", [row({})], false);
    expect(out[0]!.points).toBe(0);
  });

  it("skips incomplete rounds", () => {
    const out = buildEventResultInputsFromLeaderboard("stableford", [row({ round_complete: false })], false);
    expect(out).toHaveLength(0);
  });
});

describe("publishEventScoringResults", () => {
  it("throws when already published", async () => {
    const publishedEvent: EventDoc = {
      id: "e1",
      society_id: "s1",
      name: "X",
      format: "stableford",
      classification: "general",
      scoringResultsStatus: "published",
    } as EventDoc;

    await expect(
      publishEventScoringResults("e1", "s1", {
        getEvent: async () => publishedEvent,
      }),
    ).rejects.toThrow(/already published/);
  });

  it("does not upsert when publish readiness fails", async () => {
    const upsert = vi.fn();
    const draftEvent = {
      id: "e1",
      society_id: "s1",
      name: "X",
      format: "stableford",
      classification: "oom",
      scoringResultsStatus: "draft",
    } as EventDoc;

    await expect(
      publishEventScoringResults("e1", "s1", {
        getEvent: async () => draftEvent,
        upsertEventResults: upsert,
        getEventScoringLeaderboard: async () => [row({ round_complete: false, holes_played: 1 })],
        loadEventScoringContext: async () => ctx(),
      }),
    ).rejects.toThrow(/not ready/);

    expect(upsert).not.toHaveBeenCalled();
  });

  it("happy path: upserts results and updates event", async () => {
    const upsert = vi.fn();
    const updateEvent = vi.fn();
    const draftEvent = {
      id: "e1",
      society_id: "s1",
      name: "X",
      format: "stableford",
      classification: "oom",
      isOOM: true,
      scoringResultsStatus: "draft",
      scoringPublishVersion: 0,
    } as EventDoc;

    const board = [row({ player_id: "m1", stableford_points: 4 })];

    const summary = await publishEventScoringResults("e1", "s1", {
      getEvent: async () => draftEvent,
      upsertEventResults: upsert,
      updateEvent,
      getEventScoringLeaderboard: async () => board,
      loadEventScoringContext: async () => ctx(),
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]![0]).toBe("e1");
    expect(upsert.mock.calls[0]![1]).toBe("s1");
    expect(upsert.mock.calls[0]![2]).toHaveLength(1);
    expect(updateEvent).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({
        scoringResultsStatus: "published",
        scoringPublishVersion: 1,
      }),
    );
    expect(summary.resultCount).toBe(1);
    expect(summary.publishVersion).toBe(1);
  });
});

describe("reopenEventScoringResults", () => {
  it("throws when not published", async () => {
    await expect(
      reopenEventScoringResults("e1", "s1", {
        getEvent: async () =>
          ({
            id: "e1",
            society_id: "s1",
            name: "X",
            format: "stableford",
            classification: "general",
            scoringResultsStatus: "draft",
          }) as EventDoc,
      }),
    ).rejects.toThrow(/nothing to reopen/);
  });

  it("deletes society results and sets reopened", async () => {
    const del = vi.fn();
    const updateEvent = vi.fn();
    await reopenEventScoringResults("e1", "s1", {
      getEvent: async () =>
        ({
          id: "e1",
          society_id: "s1",
          name: "X",
          format: "stableford",
          classification: "oom",
          scoringResultsStatus: "published",
        }) as EventDoc,
      deleteEventResultsForSociety: del,
      updateEvent,
    });
    expect(del).toHaveBeenCalledWith("e1", "s1");
    expect(updateEvent).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ scoringResultsStatus: "reopened", scoringPublishedAt: null }),
    );
  });
});

describe("republish after reopen", () => {
  it("allows publish when status is reopened", async () => {
    const upsert = vi.fn();
    const updateEvent = vi.fn();
    const reopenedEvent = {
      id: "e1",
      society_id: "s1",
      name: "X",
      format: "stableford",
      classification: "oom",
      isOOM: true,
      scoringResultsStatus: "reopened",
      scoringPublishVersion: 1,
    } as EventDoc;

    await publishEventScoringResults("e1", "s1", {
      getEvent: async () => reopenedEvent,
      upsertEventResults: upsert,
      updateEvent,
      getEventScoringLeaderboard: async () => [row({ player_id: "m1" })],
      loadEventScoringContext: async () => ctx(),
    });

    expect(upsert).toHaveBeenCalled();
    expect(updateEvent).toHaveBeenCalledWith(
      "e1",
      expect.objectContaining({ scoringResultsStatus: "published", scoringPublishVersion: 2 }),
    );
  });
});
