/**
 * Lifecycle for gross-based scoring vs official `event_results`.
 * Source of truth for **entered strokes** remains `event_player_hole_scores`; official placings/OOM
 * are written only through {@link publishEventScoringResults}.
 */

export type EventScoringResultsStatus = "draft" | "published" | "reopened";

export function parseEventScoringResultsStatus(raw: unknown): EventScoringResultsStatus {
  const s = String(raw ?? "draft").toLowerCase();
  if (s === "published") return "published";
  if (s === "reopened") return "reopened";
  return "draft";
}

export function canPublishScoringResults(status: EventScoringResultsStatus): boolean {
  return status === "draft" || status === "reopened";
}

export function canReopenScoringResults(status: EventScoringResultsStatus): boolean {
  return status === "published";
}

export function isOfficialScoringPublished(status: EventScoringResultsStatus): boolean {
  return status === "published";
}
