import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import { grossScoresFromHoleRows, loadScoreEntrySheet } from "@/lib/services/eventScoreEntryLoad";
import type { EventPlayerHoleScoreRow } from "@/types/eventPlayerScoring";

function ctx(): EventScoringContext {
  return {
    eventId: "evt-1",
    societyId: "soc-1",
    name: "T",
    format: "stableford",
    rawFormat: "stableford",
    handicapAllowance: 0.95,
    teeSnapshot: { teeName: "W", courseRating: 72, slopeRating: 113, parTotal: 72 },
    holes: [
      { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
      { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
    ],
    players: [{ memberId: "p1", displayName: "P", handicapIndex: 0, courseHandicap: 0, playingHandicap: 0 }],
  };
}

describe("grossScoresFromHoleRows", () => {
  it("maps hole rows to gross map for save payload", () => {
    const rows: EventPlayerHoleScoreRow[] = [
      {
        id: "1",
        event_id: "e",
        player_id: "p",
        hole_number: 2,
        gross_strokes: 5,
        net_strokes: 5,
        stableford_points: 2,
        strokes_received: 0,
        created_at: "",
        updated_at: "",
      },
      {
        id: "2",
        event_id: "e",
        player_id: "p",
        hole_number: 1,
        gross_strokes: 4,
        net_strokes: 4,
        stableford_points: 2,
        strokes_received: 0,
        created_at: "",
        updated_at: "",
      },
    ];
    expect(grossScoresFromHoleRows(rows)).toEqual({ 1: 4, 2: 5 });
  });
});

describe("loadScoreEntrySheet", () => {
  it("loads gross map and persisted round from Supabase", async () => {
    const from = vi.fn((table: string) => {
      if (table === "event_player_hole_scores") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "h1",
                      event_id: "evt-1",
                      player_id: "p1",
                      hole_number: 1,
                      gross_strokes: 4,
                      net_strokes: 4,
                      stableford_points: 2,
                      strokes_received: 0,
                      created_at: "t",
                      updated_at: "t",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "event_player_rounds") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "r1",
                    event_id: "evt-1",
                    player_id: "p1",
                    format: "stableford",
                    course_handicap: 0,
                    playing_handicap: 0,
                    gross_total: 4,
                    net_total: 4,
                    stableford_points: 2,
                    holes_played: 1,
                    calculated_at: "t",
                    created_at: "t",
                    updated_at: "t",
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(table);
    });

    const out = await loadScoreEntrySheet("evt-1", "p1", {
      supabase: { from } as unknown as SupabaseClient,
      loadEventScoringContext: async () => ctx(),
    });

    expect(out.grossScoresByHole).toEqual({ 1: 4 });
    expect(out.savedHoleRows).toHaveLength(1);
    expect(out.persistedRound?.gross_total).toBe(4);
    expect(out.persistedRound?.holes_played).toBe(1);
  });

  it("rejects player not on event", async () => {
    await expect(
      loadScoreEntrySheet("evt-1", "x", {
        supabase: { from: () => ({}) } as unknown as SupabaseClient,
        loadEventScoringContext: async () => ctx(),
      }),
    ).rejects.toThrow("not on the event player list");
  });
});
