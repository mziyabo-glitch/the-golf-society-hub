/**
 * Domain types for competition scoring on immutable event course data only.
 * Loaders must not populate these from live `course_tees` / `course_holes`.
 */

import type { EventFormat } from "@/lib/scoring/eventFormat";

/** Tee metrics frozen on `event_courses` at lock-in (WHS inputs). */
export type EventScoringTeeSnapshot = {
  teeName: string | null;
  courseRating: number;
  slopeRating: number;
  parTotal: number;
};

/** One hole from `event_course_holes` (canonical for scoring). */
export type EventHoleSnapshot = {
  holeNumber: number;
  par: number;
  yardage: number;
  strokeIndex: number;
};

export type EventScoringPlayerInput = {
  memberId: string;
  displayName: string;
  handicapIndex: number | null;
  courseHandicap: number | null;
  playingHandicap: number | null;
};

/** Everything required to score one event from DB snapshots + member handicaps. */
export type EventScoringContext = {
  eventId: string;
  societyId: string;
  name: string;
  /** Canonical format only (see {@link normalizeEventFormat}). */
  format: EventFormat;
  rawFormat: string;
  /** Playing handicap multiplier (0.10–1.00). */
  handicapAllowance: number;
  teeSnapshot: EventScoringTeeSnapshot;
  holes: EventHoleSnapshot[];
  players: EventScoringPlayerInput[];
};

export type PlayerHoleScore = {
  holeNumber: number;
  grossStrokes: number;
  strokesReceived: number;
  netStrokes: number;
};

export type StablefordHoleResult = PlayerHoleScore & {
  stablefordPoints: number;
};

export type StrokeplayResult = {
  format: "strokeplay_net" | "strokeplay_gross";
  holes: PlayerHoleScore[];
  totalNetStrokes: number | null;
  totalGrossStrokes: number;
};

export type PlayerRoundScoreStableford = {
  kind: "stableford";
  playerId: string;
  holes: StablefordHoleResult[];
  totalStablefordPoints: number;
};

export type PlayerRoundScoreStrokeplay = {
  kind: "strokeplay_net" | "strokeplay_gross";
  playerId: string;
  strokeplay: StrokeplayResult;
};

export type PlayerRoundScore = PlayerRoundScoreStableford | PlayerRoundScoreStrokeplay;

/** One entered hole after allocation + format-specific points (stableford uses points; others may be 0). */
export type EnteredHoleScoringRow = {
  holeNumber: number;
  grossStrokes: number;
  strokesReceived: number;
  netStrokes: number;
  stablefordPoints: number;
};

/**
 * Partial or full round derived from **entered grosses only**.
 * Stroke allocation uses the full hole snapshot + playing handicap (WHS), but totals sum entered holes only.
 */
export type EnteredRoundComputation = {
  playerId: string;
  format: EventFormat;
  enteredHoles: EnteredHoleScoringRow[];
  holesPlayed: number;
  grossTotal: number;
  netTotal: number;
  stablefordPointsTotal: number;
  courseHandicap: number | null;
  playingHandicap: number | null;
  eventHoleCount: number;
  isComplete: boolean;
};
