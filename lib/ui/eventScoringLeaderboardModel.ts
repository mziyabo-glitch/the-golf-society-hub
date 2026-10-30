/**
 * Presentational model for scoring leaderboards: **no sorting** — rows must come from {@link getEventScoringLeaderboard}.
 */

import type { EventFormat } from "@/lib/scoring/eventFormat";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

export type LeaderboardColumnDef = { key: string; label: string };

export type LeaderboardColumnOptions = {
  /** When true, adds an OOM points column (values supplied via {@link leaderboardRowCells} options). */
  includeOomPointsColumn?: boolean;
};

function fmtOomPointsCell(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === Math.floor(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

export function leaderboardColumnDefs(format: EventFormat, opts?: LeaderboardColumnOptions): LeaderboardColumnDef[] {
  const rankTiePlayer: LeaderboardColumnDef[] = [
    { key: "rank", label: "Rank" },
    { key: "tie", label: "Tie" },
    { key: "player", label: "Player" },
  ];
  const oomCol: LeaderboardColumnDef[] = opts?.includeOomPointsColumn ? [{ key: "oom_points", label: "OOM pts" }] : [];
  if (format === "stableford") {
    return [
      ...rankTiePlayer,
      ...oomCol,
      { key: "stableford_points", label: "Stableford" },
      { key: "net_total", label: "Net" },
      { key: "gross_total", label: "Gross" },
      { key: "holes_played", label: "Holes" },
      { key: "card", label: "Card" },
    ];
  }
  if (format === "strokeplay_net") {
    return [
      ...rankTiePlayer,
      ...oomCol,
      { key: "net_total", label: "Net" },
      { key: "gross_total", label: "Gross" },
      { key: "holes_played", label: "Holes" },
      { key: "course_handicap", label: "CH" },
      { key: "playing_handicap", label: "PH" },
      { key: "card", label: "Card" },
    ];
  }
  return [
    ...rankTiePlayer,
    ...oomCol,
    { key: "gross_total", label: "Gross" },
    { key: "net_total", label: "Net" },
    { key: "holes_played", label: "Holes" },
    { key: "course_handicap", label: "CH" },
    { key: "playing_handicap", label: "PH" },
    { key: "card", label: "Card" },
  ];
}

function fmtHandicap(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return String(Math.round(v));
}

/**
 * One cell per column from {@link leaderboardColumnDefs} for the same `format`.
 */
export type LeaderboardRowCellOptions = {
  oomPointsByPlayerId?: Readonly<Record<string, number>>;
};

export function leaderboardRowCells(
  format: EventFormat,
  row: LeaderboardRow,
  playerNames: Readonly<Record<string, string>> | undefined,
  cellOpts?: LeaderboardRowCellOptions,
): Record<string, string> {
  const name = playerNames?.[row.player_id]?.trim() || `Player ${row.player_id.slice(0, 8)}`;
  const card = row.round_complete ? "Complete" : "Incomplete";
  const tie = row.tie_size > 1 ? String(row.tie_size) : "—";
  const oomRaw = cellOpts?.oomPointsByPlayerId?.[row.player_id];
  const oom_points =
    cellOpts?.oomPointsByPlayerId != null
      ? oomRaw != null && Number.isFinite(Number(oomRaw))
        ? fmtOomPointsCell(Number(oomRaw))
        : "—"
      : "—";

  const base: Record<string, string> = {
    rank: String(row.rank),
    tie,
    player: name,
    oom_points,
    gross_total: String(row.gross_total),
    net_total: String(row.net_total),
    stableford_points: String(row.stableford_points),
    holes_played: `${row.holes_played}/${row.expected_holes}`,
    course_handicap: fmtHandicap(row.course_handicap),
    playing_handicap: fmtHandicap(row.playing_handicap),
    card,
  };

  void format;
  return base;
}

/** Ordered cell strings matching {@link leaderboardColumnDefs}. */
export function leaderboardRowCellArray(
  format: EventFormat,
  row: LeaderboardRow,
  playerNames: Readonly<Record<string, string>> | undefined,
  opts?: LeaderboardColumnOptions & LeaderboardRowCellOptions,
): string[] {
  const defs = leaderboardColumnDefs(format, opts);
  const cells = leaderboardRowCells(format, row, playerNames, opts);
  return defs.map((d) => cells[d.key] ?? "");
}
