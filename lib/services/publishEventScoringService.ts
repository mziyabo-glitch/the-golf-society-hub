/**
 * Explicit publish / reopen for gross-based scoring → official `event_results`.
 * Default DB deps use **dynamic imports** so Vitest can inject mocks without loading the RN client graph.
 */

import { getEventScoringLeaderboard } from "@/lib/services/eventPlayerScoringService";
import { loadEventScoringContext } from "@/lib/scoring/loadEventScoringContext";
import {
  canPublishScoringResults,
  canReopenScoringResults,
  parseEventScoringResultsStatus,
  type EventScoringResultsStatus,
} from "@/lib/scoring/eventScoringPublishStatus";
import { buildEventResultInputsFromLeaderboard, validateScoringPublishReadiness } from "@/lib/scoring/publishFromLeaderboard";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import type { EventResultInput } from "@/lib/db_supabase/resultsRepo";
import type { LeaderboardRow } from "@/types/eventPlayerScoring";

export type PublishEventScoringDeps = {
  getEvent?: (eventId: string) => Promise<EventDoc | null>;
  updateEvent?: typeof import("@/lib/db_supabase/eventRepo").updateEvent;
  upsertEventResults?: typeof import("@/lib/db_supabase/resultsRepo").upsertEventResults;
  deleteEventResultsForSociety?: typeof import("@/lib/db_supabase/resultsRepo").deleteEventResultsForSociety;
  getEventScoringLeaderboard?: typeof getEventScoringLeaderboard;
  loadEventScoringContext?: typeof loadEventScoringContext;
};

export type PublishEventScoringSummary = {
  status: "published";
  publishedAt: string;
  publishVersion: number;
  resultCount: number;
  publishedRows: LeaderboardRow[];
  resultInputs: EventResultInput[];
};

async function defaultGetEvent(eventId: string): Promise<EventDoc | null> {
  const { getEvent } = await import("@/lib/db_supabase/eventRepo");
  return getEvent(eventId);
}

async function defaultUpsert(eventId: string, societyId: string, results: EventResultInput[]): Promise<void> {
  const { upsertEventResults } = await import("@/lib/db_supabase/resultsRepo");
  await upsertEventResults(eventId, societyId, results);
}

async function defaultDeleteSoc(eventId: string, societyId: string): Promise<void> {
  const { deleteEventResultsForSociety } = await import("@/lib/db_supabase/resultsRepo");
  await deleteEventResultsForSociety(eventId, societyId);
}

async function defaultUpdateEvent(
  eventId: string,
  updates: Parameters<typeof import("@/lib/db_supabase/eventRepo").updateEvent>[1],
): Promise<void> {
  const { updateEvent } = await import("@/lib/db_supabase/eventRepo");
  await updateEvent(eventId, updates);
}

/**
 * Writes official `event_results` from the current stored gross leaderboard and marks the event published.
 * Blocked when status is already `published` (use {@link reopenEventScoringResults} first).
 */
export async function publishEventScoringResults(
  eventId: string,
  societyId: string,
  deps: PublishEventScoringDeps = {},
): Promise<PublishEventScoringSummary> {
  const getEv = deps.getEvent ?? defaultGetEvent;
  const upd = deps.updateEvent ?? defaultUpdateEvent;
  const upsert = deps.upsertEventResults ?? defaultUpsert;
  const loadBoard = deps.getEventScoringLeaderboard ?? getEventScoringLeaderboard;
  const loadCtx = deps.loadEventScoringContext ?? loadEventScoringContext;

  const event = await getEv(eventId);
  if (!event?.id) throw new Error("publishEventScoringResults: event not found.");

  const status = parseEventScoringResultsStatus(event.scoringResultsStatus ?? event.scoring_results_status);
  if (!canPublishScoringResults(status)) {
    throw new Error(
      "publishEventScoringResults: results are already published. Reopen scoring before publishing again.",
    );
  }

  const ctx = await loadCtx(eventId);
  const board = await loadBoard(eventId, { loadEventScoringContext: loadCtx });

  const readiness = validateScoringPublishReadiness(board, ctx);
  if (readiness.length) {
    throw new Error(`publishEventScoringResults: not ready:\n- ${readiness.join("\n- ")}`);
  }

  const isOom = Boolean(event.isOOM ?? event.classification === "oom");
  const inputs = buildEventResultInputsFromLeaderboard(ctx.format, board, isOom);
  if (inputs.length === 0) {
    throw new Error("publishEventScoringResults: no official rows to write.");
  }

  await upsert(eventId, societyId, inputs);

  const prevVersion = Number(event.scoringPublishVersion ?? event.scoring_publish_version ?? 0);
  const nextVersion = prevVersion + 1;
  const publishedAt = new Date().toISOString();

  await upd(eventId, {
    scoringResultsStatus: "published",
    scoringPublishedAt: publishedAt,
    scoringPublishVersion: nextVersion,
  });

  const publishedRows = board.filter((r) => r.round_complete);

  return {
    status: "published",
    publishedAt,
    publishVersion: nextVersion,
    resultCount: inputs.length,
    publishedRows,
    resultInputs: inputs,
  };
}

export type ReopenEventScoringSummary = {
  status: "reopened";
};

/**
 * Clears official `event_results` for this society on the event and sets status to `reopened`
 * so gross cards can be corrected before a new publish.
 */
export async function reopenEventScoringResults(
  eventId: string,
  societyId: string,
  deps: PublishEventScoringDeps = {},
): Promise<ReopenEventScoringSummary> {
  const getEv = deps.getEvent ?? defaultGetEvent;
  const upd = deps.updateEvent ?? defaultUpdateEvent;
  const delSoc = deps.deleteEventResultsForSociety ?? defaultDeleteSoc;

  const event = await getEv(eventId);
  if (!event?.id) throw new Error("reopenEventScoringResults: event not found.");

  const status = parseEventScoringResultsStatus(event.scoringResultsStatus ?? event.scoring_results_status);
  if (!canReopenScoringResults(status)) {
    throw new Error("reopenEventScoringResults: nothing to reopen — results are not published.");
  }

  await delSoc(eventId, societyId);

  await upd(eventId, {
    scoringResultsStatus: "reopened",
    scoringPublishedAt: null,
  });

  return { status: "reopened" };
}

export function scoringPublishStatusFromEvent(event: EventDoc | null | undefined): EventScoringResultsStatus {
  if (!event) return "draft";
  return parseEventScoringResultsStatus(event.scoringResultsStatus ?? event.scoring_results_status);
}
