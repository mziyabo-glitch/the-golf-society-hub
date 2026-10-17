import type { EventScoringResultsStatus } from "@/lib/scoring/eventScoringPublishStatus";
import { isOfficialScoringPublished, parseEventScoringResultsStatus } from "@/lib/scoring/eventScoringPublishStatus";

export type ScoringOfficialUiKind = "draft" | "reopened" | "published";

export function scoringOfficialUiKind(rawStatus: unknown): ScoringOfficialUiKind {
  const s = parseEventScoringResultsStatus(rawStatus);
  if (s === "published") return "published";
  if (s === "reopened") return "reopened";
  return "draft";
}

/** Short badge label for headers and lists. */
export function scoringOfficialBadgeLabel(kind: ScoringOfficialUiKind): string {
  if (kind === "published") return "Official";
  if (kind === "reopened") return "Draft · reopened";
  return "Draft";
}

/** One-line explainer for leaderboard / scoring surfaces. */
export function scoringLeaderboardStatusExplainer(
  kind: ScoringOfficialUiKind,
  input: { isOomEvent: boolean; hasAnySavedRound: boolean },
): string {
  if (kind === "published") {
    return input.isOomEvent
      ? "Published: placings and OOM points below match official event results."
      : "Published: leaderboard order matches official event results.";
  }
  if (kind === "reopened") {
    return "Scoring was reopened: official results were cleared for your society. Edits here are draft until you publish again.";
  }
  if (!input.hasAnySavedRound) {
    return input.isOomEvent
      ? "Draft: enter gross scores. OOM totals update only after you publish official results."
      : "Draft: enter gross scores. Official placings are created when you publish.";
  }
  return input.isOomEvent
    ? "Draft: order reflects saved rounds only. Society OOM totals update only after publish."
    : "Draft: order reflects saved rounds only. Official placings are created when you publish.";
}

export function isPublishedScoringStatus(raw: unknown): boolean {
  return isOfficialScoringPublished(parseEventScoringResultsStatus(raw));
}
