import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import { getEventScoringLeaderboard, savePlayerRoundGrossScores } from "./eventPlayerScoringService";

function miniCtx(overrides: Partial<EventScoringContext> = {}): EventScoringContext {
  const holes = [
    { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
    { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
  ];
  return {
    eventId: "evt-1",
    societyId: "soc-1",
    name: "Mini",
    format: "stableford",
    rawFormat: "stableford",
    handicapAllowance: 0.95,
    teeSnapshot: { teeName: "White", courseRating: 72, slopeRating: 113, parTotal: 8 },
    holes,
    players: [
      {
        memberId: "p1",
        displayName: "One",
        handicapIndex: 0,
        courseHandicap: 0,
        playingHandicap: 0,
      },
    ],
    ...overrides,
  };
}

function createMockSupabase() {
  const state = {
    lastHoleInsert: [] as Record<string, unknown>[],
    roundsForEvent: [] as Record<string, unknown>[],
    deleteCalls: 0,
  };

  const holeTable = () => ({
    delete: () => ({
      eq: () => ({
        eq: async () => {
          state.deleteCalls++;
          return { error: null };
        },
      }),
    }),
    upsert: async (rows: Record<string, unknown>[]) => {
      state.lastHoleInsert = rows;
      return { error: null };
    },
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: async () => ({
            data: state.lastHoleInsert.map((r, i) => ({
              ...r,
              id: `hole-${i}`,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            })),
            error: null,
          }),
        }),
      }),
    }),
  });

  const roundsTable = () => ({
    upsert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          const merged = {
            id: "round-1",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            ...row,
          };
          state.roundsForEvent = [merged];
          return { data: merged, error: null };
        },
      }),
    }),
    select: () => ({
      eq: async () => ({ data: state.roundsForEvent, error: null }),
    }),
  });

  const from = vi.fn((table: string) => {
    if (table === "event_player_hole_scores") return holeTable();
    if (table === "event_player_rounds") return roundsTable();
    throw new Error(`unexpected table ${table}`);
  });

  return { client: { from } as unknown as SupabaseClient, state };
}

describe("savePlayerRoundGrossScores", () => {
  it("rejects player not on event", async () => {
    const { client, state } = createMockSupabase();
    await expect(
      savePlayerRoundGrossScores("evt-1", "ghost", { 1: 4 }, {
        supabase: client,
        loadEventScoringContext: async () => miniCtx(),
      }),
    ).rejects.toThrow("not on the event player list");
    expect(state.deleteCalls).toBe(0);
  });

  it("rejects invalid gross strokes", async () => {
    const { client, state } = createMockSupabase();
    await expect(
      savePlayerRoundGrossScores("evt-1", "p1", { 1: 0 }, {
        supabase: client,
        loadEventScoringContext: async () => miniCtx(),
      }),
    ).rejects.toThrow("invalid gross scores");
    expect(state.deleteCalls).toBe(0);
  });

  it("rejects unknown hole vs snapshot", async () => {
    const { client, state } = createMockSupabase();
    await expect(
      savePlayerRoundGrossScores("evt-1", "p1", { 3: 4 }, {
        supabase: client,
        loadEventScoringContext: async () => miniCtx(),
      }),
    ).rejects.toThrow("invalid gross scores");
    expect(state.deleteCalls).toBe(0);
  });

  it("full replace on save: delete, insert holes, upsert round; idempotent payload yields same totals", async () => {
    const { client, state } = createMockSupabase();
    const loadCtx = vi.fn(async () => miniCtx());

    const r1 = await savePlayerRoundGrossScores("evt-1", "p1", { 1: 4, 2: 5 }, { supabase: client, loadEventScoringContext: loadCtx });
    expect(state.deleteCalls).toBe(1);
    expect(state.lastHoleInsert).toHaveLength(2);
    expect(r1.round.gross_total).toBe(9);
    expect(r1.round.holes_played).toBe(2);
    expect(r1.holes).toHaveLength(2);
    expect(r1.leaderboard).toHaveLength(1);
    expect(r1.leaderboard[0]!.rank).toBe(1);

    const r2 = await savePlayerRoundGrossScores("evt-1", "p1", { 1: 4, 2: 5 }, { supabase: client, loadEventScoringContext: loadCtx });
    expect(state.deleteCalls).toBe(2);
    expect(r2.round.gross_total).toBe(9);
  });

  it("edit path: fewer holes replaces prior derived rows", async () => {
    const { client, state } = createMockSupabase();
    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 4, 2: 5 }, {
      supabase: client,
      loadEventScoringContext: async () => miniCtx(),
    });
    expect(state.lastHoleInsert).toHaveLength(2);
    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 3 }, {
      supabase: client,
      loadEventScoringContext: async () => miniCtx(),
    });
    expect(state.lastHoleInsert).toHaveLength(1);
    expect(state.lastHoleInsert[0]!.hole_number).toBe(1);
  });

  it("strokeplay_net: persists net-derived hole rows", async () => {
    const { client, state } = createMockSupabase();
    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 5, 2: 5 }, {
      supabase: client,
      loadEventScoringContext: async () =>
        miniCtx({
          format: "strokeplay_net",
          rawFormat: "strokeplay_net",
          players: [
            { memberId: "p1", displayName: "N", handicapIndex: 0, courseHandicap: 0, playingHandicap: 0 },
          ],
        }),
    });
    expect(state.lastHoleInsert.every((h) => Number(h.net_strokes) === Number(h.gross_strokes))).toBe(true);
    expect(state.lastHoleInsert.every((h) => Number(h.stableford_points) === 0)).toBe(true);
  });

  it("strokeplay_gross: net equals gross on rows", async () => {
    const { client, state } = createMockSupabase();
    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 4, 2: 6 }, {
      supabase: client,
      loadEventScoringContext: async () =>
        miniCtx({
          format: "strokeplay_gross",
          rawFormat: "strokeplay_gross",
          players: [
            { memberId: "p1", displayName: "G", handicapIndex: 20, courseHandicap: 22, playingHandicap: 21 },
          ],
        }),
    });
    expect(state.lastHoleInsert[0]!.strokes_received).toBe(0);
    expect(state.lastHoleInsert[0]!.net_strokes).toBe(state.lastHoleInsert[0]!.gross_strokes);
  });

  it("stableford: hole rows include stableford_points", async () => {
    const { client, state } = createMockSupabase();
    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 4, 2: 4 }, {
      supabase: client,
      loadEventScoringContext: async () => miniCtx(),
    });
    const pts = state.lastHoleInsert.map((h) => Number(h.stableford_points));
    expect(pts.every((p) => p === 2)).toBe(true);
    expect(state.roundsForEvent[0]!.stableford_points).toBe(4);
  });
});

describe("getEventScoringLeaderboard", () => {
  it("returns ordered rows from stored summaries", async () => {
    const state = {
      roundsForEvent: [
        {
          player_id: "b",
          gross_total: 10,
          net_total: 10,
          stableford_points: 2,
          holes_played: 2,
          course_handicap: null,
          playing_handicap: null,
        },
        {
          player_id: "a",
          gross_total: 8,
          net_total: 8,
          stableford_points: 4,
          holes_played: 2,
          course_handicap: null,
          playing_handicap: null,
        },
      ] as Record<string, unknown>[],
    };

    const from = vi.fn((table: string) => {
      if (table !== "event_player_rounds") throw new Error(table);
      return {
        select: () => ({
          eq: async () => ({ data: state.roundsForEvent, error: null }),
        }),
      };
    });

    const rows = await getEventScoringLeaderboard("evt-1", {
      supabase: { from } as unknown as SupabaseClient,
      loadEventScoringContext: async () => miniCtx(),
    });
    expect(rows.map((r) => r.player_id)).toEqual(["a", "b"]);
    expect(rows[0]!.stableford_points).toBe(4);
  });
});
