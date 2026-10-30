import type { EventFormat } from "@/lib/scoring/eventFormat";

/** Row shape for `event_player_rounds` (summary / derived). */
export type EventPlayerRoundRow = {
  id: string;
  event_id: string;
  player_id: string;
  format: EventFormat;
  course_handicap: number | null;
  playing_handicap: number | null;
  gross_total: number;
  net_total: number;
  stableford_points: number;
  holes_played: number;
  calculated_at: string;
  created_at: string;
  updated_at: string;
};

/** Row shape for `event_player_hole_scores` (source gross + derived per hole). */
export type EventPlayerHoleScoreRow = {
  id: string;
  event_id: string;
  player_id: string;
  hole_number: number;
  gross_strokes: number;
  net_strokes: number;
  stableford_points: number;
  strokes_received: number;
  created_at: string;
  updated_at: string;
};

export type LeaderboardRow = {
  player_id: string;
  rank: number;
  /** Number of players tied at this rank (1 = no tie). */
  tie_size: number;
  gross_total: number;
  net_total: number;
  stableford_points: number;
  holes_played: number;
  expected_holes: number;
  /** True when holes_played equals the event hole snapshot count (9 or 18). */
  round_complete: boolean;
  /** When false, row is shown for transparency but must not win over complete rounds. */
  eligible_for_primary_rank: boolean;
  course_handicap: number | null;
  playing_handicap: number | null;
};

export type SavePlayerRoundGrossScoresResult = {
  round: EventPlayerRoundRow;
  holes: EventPlayerHoleScoreRow[];
  leaderboard: LeaderboardRow[];
};
