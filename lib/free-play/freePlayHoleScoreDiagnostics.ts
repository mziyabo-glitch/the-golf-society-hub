/** Client/server diagnostics for `free_play_round_hole_scores` rows. */

export type HoleScoreRowKey = { round_player_id: string; hole_number: number };

export function analyzeHoleScoreRowKeys(rows: readonly HoleScoreRowKey[]): {
  totalRows: number;
  duplicateKeys: string[];
  rowCountByRoundPlayerId: Record<string, number>;
} {
  const keys = new Map<string, number>();
  for (const h of rows) {
    const k = `${h.round_player_id}:${h.hole_number}`;
    keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const duplicateKeys = [...keys.entries()].filter(([, c]) => c > 1).map(([k]) => k);
  const rowCountByRoundPlayerId: Record<string, number> = {};
  for (const h of rows) {
    rowCountByRoundPlayerId[h.round_player_id] = (rowCountByRoundPlayerId[h.round_player_id] ?? 0) + 1;
  }
  return { totalRows: rows.length, duplicateKeys, rowCountByRoundPlayerId };
}
