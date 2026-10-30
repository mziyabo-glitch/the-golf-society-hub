import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventScoringContext } from "@/lib/scoring/eventScoringTypes";
import { getEventScoringLeaderboard, savePlayerRoundGrossScores } from "@/lib/services/eventPlayerScoringService";
import { loadScoreEntrySheet } from "@/lib/services/eventScoreEntryLoad";
import { leaderboardColumnDefs, leaderboardRowCellArray } from "@/lib/ui/eventScoringLeaderboardModel";

function miniCtx(): EventScoringContext {
  return {
    eventId: "evt-1",
    societyId: "soc-1",
    name: "Flow",
    format: "stableford",
    rawFormat: "stableford",
    handicapAllowance: 0.95,
    teeSnapshot: { teeName: "W", courseRating: 72, slopeRating: 113, parTotal: 8 },
    holes: [
      { holeNumber: 1, par: 4, yardage: 400, strokeIndex: 1 },
      { holeNumber: 2, par: 4, yardage: 390, strokeIndex: 2 },
    ],
    players: [{ memberId: "p1", displayName: "Pat", handicapIndex: 0, courseHandicap: 0, playingHandicap: 0 }],
  };
}

/**
 * Minimal in-memory “DB” so load ↔ save ↔ leaderboard can run in one test without duplicate ranking logic in the UI layer.
 */
function createFlowSupabase() {
  const store = {
    holes: [] as Record<string, unknown>[],
    round: null as Record<string, unknown> | null,
    deleteCalls: 0,
  };

  const holeApi = () => ({
    delete: () => ({
      eq: () => ({
        eq: async () => {
          store.deleteCalls++;
          store.holes = [];
          return { error: null };
        },
      }),
    }),
    upsert: async (rows: Record<string, unknown>[]) => {
      store.holes = rows.map((r, i) => ({
        id: `hole-${i}`,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        net_strokes: r.net_strokes ?? 4,
        stableford_points: r.stableford_points ?? 2,
        strokes_received: r.strokes_received ?? 0,
        ...r,
      }));
      return { error: null };
    },
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: async () => ({ data: [...store.holes], error: null }),
        }),
      }),
    }),
  });

  const roundsApi = () => ({
    upsert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          store.round = {
            id: "round-1",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            ...row,
          };
          return { data: store.round, error: null };
        },
      }),
    }),
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: store.round, error: null }),
        }),
        then(onFulfilled: (v: unknown) => unknown) {
          return Promise.resolve({ data: store.round ? [store.round] : [], error: null }).then(onFulfilled);
        },
      }),
    }),
  });

  const from = vi.fn((table: string) => {
    if (table === "event_player_hole_scores") return holeApi();
    if (table === "event_player_rounds") return roundsApi();
    throw new Error(table);
  });

  return { client: { from } as unknown as SupabaseClient, store };
}

describe("eventGrossScoreEntryFlow (integration)", () => {
  it("load empty → first save → reload for edit → resave → leaderboard reads stored summaries only", async () => {
    const { client, store } = createFlowSupabase();
    const loadCtx = vi.fn(async () => miniCtx());

    let sheet = await loadScoreEntrySheet("evt-1", "p1", { supabase: client, loadEventScoringContext: loadCtx });
    expect(sheet.grossScoresByHole).toEqual({});
    expect(sheet.persistedRound).toBeNull();

    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 4, 2: 5 }, { supabase: client, loadEventScoringContext: loadCtx });
    expect(store.deleteCalls).toBe(1);
    expect(store.holes).toHaveLength(2);
    expect(store.round?.gross_total).toBe(9);

    sheet = await loadScoreEntrySheet("evt-1", "p1", { supabase: client, loadEventScoringContext: loadCtx });
    expect(sheet.grossScoresByHole).toEqual({ 1: 4, 2: 5 });
    expect(sheet.persistedRound?.gross_total).toBe(9);

    await savePlayerRoundGrossScores("evt-1", "p1", { 1: 3, 2: 5 }, { supabase: client, loadEventScoringContext: loadCtx });
    expect(store.deleteCalls).toBe(2);
    expect(store.holes).toHaveLength(2);
    expect(Number(store.holes.find((h) => Number(h.hole_number) === 1)?.gross_strokes)).toBe(3);
    expect(store.round?.gross_total).toBe(8);

    const board = await getEventScoringLeaderboard("evt-1", { supabase: client, loadEventScoringContext: loadCtx });
    expect(board).toHaveLength(1);
    expect(board[0]!.gross_total).toBe(8);
    expect(board[0]!.rank).toBe(1);

    const defs = leaderboardColumnDefs("stableford");
    const cells = leaderboardRowCellArray("stableford", board[0]!, { p1: "Pat" });
    expect(cells).toHaveLength(defs.length);
    const grossIdx = defs.findIndex((d) => d.key === "gross_total");
    expect(cells[grossIdx]).toBe("8");
  });
});
