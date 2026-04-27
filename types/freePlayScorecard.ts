export type FreePlayScoringMode = "quick" | "hole_by_hole";
/** Competition format for net / Stableford (v1). */
export type FreePlayScoringFormat = "stroke_net" | "stableford";
export type FreePlayRoundStatus = "draft" | "in_progress" | "completed";
export type FreePlayPlayerType = "member" | "app_user" | "guest";
export type FreePlayInviteStatus = "none" | "invited" | "joined";

export type FreePlayRound = {
  id: string;
  society_id: string | null;
  created_by_user_id: string;
  created_by_member_id: string | null;
  course_id: string | null;
  course_name: string;
  tee_id: string | null;
  tee_name: string | null;
  join_code: string;
  scoring_mode: FreePlayScoringMode;
  /** stroke_net | stableford — drives leaderboard (v1). */
  scoring_format: FreePlayScoringFormat;
  status: FreePlayRoundStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type FreePlayRoundPlayer = {
  id: string;
  round_id: string;
  player_type: FreePlayPlayerType;
  member_id: string | null;
  user_id: string | null;
  invite_email: string | null;
  display_name: string;
  /** WHS-style handicap index (decimal). */
  handicap_index: number;
  /** Playing handicap strokes for the round / selected tee (integer or half per DB). */
  playing_handicap: number | null;
  /** Optional guest label when player_type is guest. */
  guest_name: string | null;
  /** Per-player tee override; defaults to round tee when null. */
  tee_id: string | null;
  invite_status: FreePlayInviteStatus;
  is_owner: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FreePlayRoundScore = {
  id: string;
  round_id: string;
  round_player_id: string;
  quick_total: number | null;
  holes_played: number;
  created_at: string;
  updated_at: string;
};

export type FreePlayRoundHoleScore = {
  id: string;
  round_id: string;
  round_player_id: string;
  hole_number: number;
  /** Null = pickup / no score recorded for this hole. */
  gross_strokes: number | null;
  created_at: string;
  updated_at: string;
};

export type FreePlayRoundBundle = {
  round: FreePlayRound;
  players: FreePlayRoundPlayer[];
  scores: FreePlayRoundScore[];
  holeScores: FreePlayRoundHoleScore[];
};
