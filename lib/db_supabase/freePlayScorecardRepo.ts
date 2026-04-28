import { supabase } from "@/lib/supabase";
import type {
  FreePlayRound,
  FreePlayRoundBundle,
  FreePlayRoundHoleScore,
  FreePlayRoundPlayer,
  FreePlayRoundScore,
  FreePlayScoringFormat,
  FreePlayScoringMode,
} from "@/types/freePlayScorecard";

function isFreePlaySchemaMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    e.code === "42P01" ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

function isFreePlayPermissionDenied(error: unknown): boolean {
  const e = error as { code?: string; message?: string; status?: number } | null;
  if (!e) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    e.code === "42501" ||
    e.status === 403 ||
    msg.includes("forbidden") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  );
}

/** PostgREST / Supabase client error fields for debugging RLS and validation failures. */
function formatSupabaseErrorDetails(error: unknown): string {
  const e = error as { message?: string; code?: string; details?: string; hint?: string } | null;
  if (!e) return "";
  const parts = [
    e.message,
    e.code ? `code=${e.code}` : null,
    e.details ? `details=${e.details}` : null,
    e.hint ? `hint=${e.hint}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

function logFreePlaySupabaseError(context: string, error: unknown, extra?: Record<string, unknown>): void {
  const e = error as Record<string, unknown> | null;
  console.warn(`[freePlayScorecardRepo] ${context}`, {
    ...extra,
    message: e?.message,
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    status: e?.status,
  });
  if (e?.message != null) console.log(`[freePlayScorecardRepo] ${context} Supabase message`, e.message);
  if (e?.code != null) console.log(`[freePlayScorecardRepo] ${context} Supabase code`, e.code);
  if (e?.details != null) console.log(`[freePlayScorecardRepo] ${context} Supabase details`, e.details);
  if (e?.hint != null) console.log(`[freePlayScorecardRepo] ${context} Supabase hint`, e.hint);
  if (extra?.insertPayload != null) {
    console.log(
      `[freePlayScorecardRepo] ${context} insertPayload full`,
      JSON.stringify(extra.insertPayload, null, 2),
    );
  }
}

function toFreePlayError(error: unknown, fallback: string): Error {
  const detail = formatSupabaseErrorDetails(error);
  if (isFreePlayPermissionDenied(error)) {
    const base =
      "Free Play access was denied (RLS or permissions). Apply Supabase migration 139 (free_play_rounds RLS created_by_user_id) and reload PostgREST schema (NOTIFY pgrst, 'reload schema';).";
    return new Error(detail ? `${base} ${detail}` : base);
  }
  if (isFreePlaySchemaMissing(error)) {
    return new Error(
      "Free Play tables are missing in this database. Run migration `122_free_play_scorecards.sql` and reload Supabase API schema.",
    );
  }
  const e = error as { message?: string } | null;
  const msg = e?.message || fallback;
  return new Error(detail && !msg.includes(detail) ? `${msg} (${detail})` : msg);
}

export type CreateFreePlayRoundPlayerInput = {
  playerType: "member" | "app_user" | "guest";
  displayName: string;
  memberId?: string | null;
  userId?: string | null;
  inviteEmail?: string | null;
  handicapIndex?: number | null;
  courseHandicap?: number | null;
  playingHandicap?: number | null;
  handicapSource?: "auto" | "manual" | null;
  guestName?: string | null;
  teeId?: string | null;
  inviteStatus?: "none" | "invited" | "joined";
  isOwner?: boolean;
  sortOrder?: number;
};

export type CreateRoundInput = {
  societyId?: string | null;
  createdByMemberId?: string | null;
  courseId?: string | null;
  courseName: string;
  teeId?: string | null;
  teeName?: string | null;
  scoringMode?: FreePlayScoringMode;
  /** stroke_net | stableford (v1). Defaults to stroke_net. */
  scoringFormat?: FreePlayScoringFormat;
  players: CreateFreePlayRoundPlayerInput[];
};

function mapScoringFormat(row: Record<string, unknown>): FreePlayScoringFormat {
  const v = row.scoring_format;
  return v === "stableford" ? "stableford" : "stroke_net";
}

function mapRound(row: Record<string, unknown>): FreePlayRound {
  return {
    id: String(row.id),
    society_id: row.society_id ? String(row.society_id) : null,
    created_by_user_id: String(row.created_by_user_id),
    created_by_member_id: row.created_by_member_id ? String(row.created_by_member_id) : null,
    course_id: row.course_id ? String(row.course_id) : null,
    course_name: String(row.course_name ?? ""),
    tee_id: row.tee_id ? String(row.tee_id) : null,
    tee_name: row.tee_name ? String(row.tee_name) : null,
    join_code: String(row.join_code ?? ""),
    scoring_mode: row.scoring_mode === "hole_by_hole" ? "hole_by_hole" : "quick",
    scoring_format: "scoring_format" in row && row.scoring_format != null ? mapScoringFormat(row) : "stroke_net",
    status: row.status === "completed" ? "completed" : row.status === "in_progress" ? "in_progress" : "draft",
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRoundPlayer(row: Record<string, unknown>): FreePlayRoundPlayer {
  const ph = row.playing_handicap;
  const ch = row.course_handicap;
  const hs = row.handicap_source;
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    player_type: row.player_type as FreePlayRoundPlayer["player_type"],
    member_id: row.member_id ? String(row.member_id) : null,
    user_id: row.user_id ? String(row.user_id) : null,
    invite_email: row.invite_email ? String(row.invite_email) : null,
    display_name: String(row.display_name ?? "Player"),
    handicap_index: Number.isFinite(Number(row.handicap_index)) ? Number(row.handicap_index) : 0,
    course_handicap: ch == null || ch === "" ? null : Number.isFinite(Number(ch)) ? Number(ch) : null,
    playing_handicap: ph == null || ph === "" ? null : Number.isFinite(Number(ph)) ? Number(ph) : null,
    handicap_source: hs === "manual" ? "manual" : hs === "auto" ? "auto" : null,
    guest_name: row.guest_name != null && String(row.guest_name).trim() ? String(row.guest_name).trim() : null,
    tee_id: row.tee_id ? String(row.tee_id) : null,
    invite_status: row.invite_status === "invited" ? "invited" : row.invite_status === "joined" ? "joined" : "none",
    is_owner: row.is_owner === true,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapScore(row: Record<string, unknown>): FreePlayRoundScore {
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    round_player_id: String(row.round_player_id),
    quick_total: row.quick_total == null ? null : Number(row.quick_total),
    holes_played: Number.isFinite(Number(row.holes_played)) ? Number(row.holes_played) : 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapHoleScore(row: Record<string, unknown>): FreePlayRoundHoleScore {
  const g = row.gross_strokes;
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    round_player_id: String(row.round_player_id),
    hole_number: Number(row.hole_number),
    gross_strokes: g == null || g === "" ? null : Number.isFinite(Number(g)) ? Number(g) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function requireAuthUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) {
    throw new Error(error?.message || "You need to be signed in.");
  }
  return data.user.id;
}

export async function listMyFreePlayRounds(): Promise<FreePlayRound[]> {
  const uid = await requireAuthUserId();
  const [{ data: mine, error: mineErr }, { data: joinedRows, error: joinErr }] = await Promise.all([
    supabase
      .from("free_play_rounds")
      .select("*")
      .eq("created_by_user_id", uid)
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase.from("free_play_round_players").select("round_id").eq("user_id", uid).limit(50),
  ]);
  if (mineErr) throw toFreePlayError(mineErr, "Failed to load free-play rounds.");
  if (joinErr) throw toFreePlayError(joinErr, "Failed to load joined rounds.");

  const joinedRoundIds = [...new Set((joinedRows ?? []).map((r: Record<string, unknown>) => String(r.round_id)).filter(Boolean))];
  if (joinedRoundIds.length === 0) return (mine ?? []).map((r) => mapRound(r as Record<string, unknown>));

  const { data: joinedRounds, error } = await supabase
    .from("free_play_rounds")
    .select("*")
    .in("id", joinedRoundIds)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw toFreePlayError(error, "Failed to load free-play rounds.");

  const merged = [...(mine ?? []), ...(joinedRounds ?? [])];
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of merged) byId.set(String((row as Record<string, unknown>).id), row as Record<string, unknown>);
  return [...byId.values()].map(mapRound).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** Active (draft or in-progress) rounds for the signed-in user, newest first. */
export async function listMyActiveFreePlayRounds(): Promise<FreePlayRound[]> {
  const rows = await listMyFreePlayRounds();
  return rows.filter((r) => r.status === "draft" || r.status === "in_progress");
}

export async function getFreePlayRoundBundle(roundId: string): Promise<FreePlayRoundBundle> {
  const [{ data: roundRow, error: roundError }, { data: playersRows, error: playersError }, { data: scoreRows, error: scoreError }, { data: holeRows, error: holeError }] = await Promise.all([
    supabase.from("free_play_rounds").select("*").eq("id", roundId).single(),
    supabase.from("free_play_round_players").select("*").eq("round_id", roundId).order("sort_order", { ascending: true }),
    supabase.from("free_play_round_scores").select("*").eq("round_id", roundId),
    supabase.from("free_play_round_hole_scores").select("*").eq("round_id", roundId).order("hole_number", { ascending: true }),
  ]);
  if (roundError || !roundRow) throw toFreePlayError(roundError, "Round not found.");
  if (playersError) throw toFreePlayError(playersError, "Failed to load players.");
  if (scoreError) throw toFreePlayError(scoreError, "Failed to load scores.");
  if (holeError) throw toFreePlayError(holeError, "Failed to load hole scores.");
  return {
    round: mapRound(roundRow as Record<string, unknown>),
    players: (playersRows ?? []).map((r) => mapRoundPlayer(r as Record<string, unknown>)),
    scores: (scoreRows ?? []).map((r) => mapScore(r as Record<string, unknown>)),
    holeScores: (holeRows ?? []).map((r) => mapHoleScore(r as Record<string, unknown>)),
  };
}

/**
 * INSERT payload for `public.free_play_rounds` (PostgREST snake_case keys only).
 *
 * ## DB schema (migrations 122 + 131; owner / RLS: 138)
 * | column | type | null | default | notes |
 * |--------|------|------|-----------|-------|
 * | id | uuid | NO | gen_random_uuid() | do not send |
 * | society_id | uuid | YES | — | FK societies |
 * | **created_by_user_id** | uuid | **NO** | — | **Owner for RLS** — must equal `auth.uid()` on INSERT |
 * | created_by_member_id | uuid | YES | — | FK members |
 * | course_id | uuid | YES | — | FK courses |
 * | course_name | text | NO | — | |
 * | tee_id | uuid | YES | — | FK course_tees |
 * | tee_name | text | YES | — | |
 * | join_code | text | NO | random unique | do not send |
 * | scoring_mode | text | NO | 'quick' | 'quick' \| 'hole_by_hole' |
 * | scoring_format | text | NO | 'stroke_net' | 'stroke_net' \| 'stableford' (131) |
 * | status | text | NO | 'draft' | 'draft' \| 'in_progress' \| 'completed' |
 * | started_at, completed_at | timestamptz | YES | — | do not send on create |
 * | created_at, updated_at | timestamptz | NO | now() | do not send |
 *
 * ## Active RLS on `free_play_rounds` (139_free_play_rounds_rls_created_by_user_id.sql; supersedes 138)
 * - **SELECT** `TO authenticated` **USING** `(created_by_user_id = auth.uid() OR EXISTS (player row with user_id = auth.uid()))` — creator or roster app user (join / “my rounds” for joined rounds).
 * - **INSERT** `WITH CHECK` **`(created_by_user_id = auth.uid())`** — no `owner_user_id` / `user_id` column; no society `EXISTS` on INSERT.
 * - **UPDATE** `USING` + `WITH CHECK` **`(created_by_user_id = auth.uid())`**
 * - **DELETE** `USING` **`(created_by_user_id = auth.uid())`**
 */
type FreePlayRoundInsertRow = {
  society_id: string | null;
  created_by_user_id: string;
  created_by_member_id: string | null;
  course_id: string | null;
  course_name: string;
  tee_id: string | null;
  tee_name: string | null;
  scoring_mode: FreePlayScoringMode;
  scoring_format: FreePlayScoringFormat;
  status: "draft";
};

export async function createFreePlayRound(input: CreateRoundInput): Promise<FreePlayRound> {
  const authUserId = await requireAuthUserId();
  const scoringFormat: FreePlayScoringFormat = input.scoringFormat === "stableford" ? "stableford" : "stroke_net";
  const insertPayload: FreePlayRoundInsertRow = {
    society_id: input.societyId ?? null,
    created_by_user_id: authUserId,
    created_by_member_id: input.createdByMemberId ?? null,
    course_id: input.courseId ?? null,
    course_name: input.courseName.trim(),
    tee_id: input.teeId ?? null,
    tee_name: input.teeName ?? null,
    scoring_mode: input.scoringMode ?? "hole_by_hole",
    scoring_format: scoringFormat,
    status: "draft",
  };
  if (insertPayload.created_by_user_id !== authUserId) {
    throw new Error("createFreePlayRound: internal error — created_by_user_id must match session user.");
  }
  console.log("[freePlayScorecardRepo] createFreePlayRound authUserId", authUserId);
  console.log("[freePlayScorecardRepo] createFreePlayRound payload keys", Object.keys(insertPayload));
  console.log("[freePlayScorecardRepo] createFreePlayRound payload full", JSON.stringify(insertPayload, null, 2));

  const { data: roundRow, error: roundError } = await supabase.from("free_play_rounds").insert(insertPayload).select("*").single();
  if (roundError || !roundRow) {
    logFreePlaySupabaseError("createFreePlayRound: free_play_rounds insert failed", roundError, {
      authUserId,
      insertPayload,
    });
    throw toFreePlayError(roundError, "Could not create free-play round.");
  }

  const roundId = String((roundRow as Record<string, unknown>).id);
  const defaultTeeId = input.teeId ?? null;
  const playerRows = input.players
    .filter((p) => p.displayName?.trim())
    .map((p, i) => {
      const hi = Number.isFinite(Number(p.handicapIndex)) ? Number(p.handicapIndex) : 0;
      const ch = Number.isFinite(Number(p.courseHandicap)) ? Number(p.courseHandicap) : hi;
      const ph = Number.isFinite(Number(p.playingHandicap)) ? Number(p.playingHandicap) : hi;
      return {
        round_id: roundId,
        player_type: p.playerType,
        member_id: p.memberId ?? null,
        user_id: p.userId ?? null,
        invite_email: p.inviteEmail ?? null,
        display_name: p.displayName.trim(),
        handicap_index: hi,
        course_handicap: Math.round(ch),
        playing_handicap: Math.round(ph),
        handicap_source: p.handicapSource ?? "auto",
        guest_name: p.guestName?.trim() || (p.playerType === "guest" ? p.displayName.trim() : null),
        tee_id: p.teeId ?? defaultTeeId,
        invite_status: p.inviteStatus ?? "none",
        is_owner: p.isOwner === true,
        sort_order: Number.isFinite(Number(p.sortOrder)) ? Number(p.sortOrder) : i,
      };
    });
  if (playerRows.length > 0) {
    if (__DEV__) {
      console.log("[freePlayScorecardRepo] createFreePlayRound player rows", JSON.stringify(playerRows));
    }
    const { error } = await supabase.from("free_play_round_players").insert(playerRows);
    if (error) {
      logFreePlaySupabaseError("createFreePlayRound: free_play_round_players insert failed", error, { roundId });
      throw toFreePlayError(error, "Could not save free-play players.");
    }
  }

  return mapRound(roundRow as Record<string, unknown>);
}

export async function updateFreePlayPlayerHandicap(roundPlayerId: string, handicapIndex: number): Promise<void> {
  const h = Number.isFinite(Number(handicapIndex)) ? Number(handicapIndex) : 0;
  const { error } = await supabase.from("free_play_round_players").update({ handicap_index: h }).eq("id", roundPlayerId);
  if (error) throw toFreePlayError(error, "Could not update handicap.");
}

export async function updateFreePlayPlayerCourseAndPlayingHandicap(
  roundPlayerId: string,
  payload: { courseHandicap: number | null; playingHandicap: number | null; handicapSource?: "auto" | "manual" | null },
): Promise<void> {
  const chRaw = payload.courseHandicap == null ? null : Number.isFinite(Number(payload.courseHandicap)) ? Number(payload.courseHandicap) : null;
  const phRaw =
    payload.playingHandicap == null ? null : Number.isFinite(Number(payload.playingHandicap)) ? Number(payload.playingHandicap) : null;
  const ch = chRaw == null ? null : Math.round(chRaw);
  const ph = phRaw == null ? null : Math.round(phRaw);
  const { error } = await supabase
    .from("free_play_round_players")
    .update({
      course_handicap: ch,
      playing_handicap: ph,
      handicap_source: payload.handicapSource ?? "auto",
    })
    .eq("id", roundPlayerId);
  if (error) throw toFreePlayError(error, "Could not update playing handicap.");
}

export async function setFreePlayRoundMode(roundId: string, mode: FreePlayScoringMode): Promise<void> {
  const { error } = await supabase.from("free_play_rounds").update({ scoring_mode: mode }).eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not change scoring mode.");
}

export async function setFreePlayScoringFormat(roundId: string, format: FreePlayScoringFormat): Promise<void> {
  const f = format === "stableford" ? "stableford" : "stroke_net";
  const { error } = await supabase.from("free_play_rounds").update({ scoring_format: f }).eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not change scoring format.");
}

export async function updateFreePlayRoundTee(roundId: string, teeId: string, teeName: string): Promise<void> {
  const { error } = await supabase
    .from("free_play_rounds")
    .update({ tee_id: teeId, tee_name: teeName || null })
    .eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not update round tee.");
}

export async function relinkFreePlayRoundCourse(
  roundId: string,
  payload: { courseId: string; courseName: string; teeId: string | null; teeName: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("free_play_rounds")
    .update({
      course_id: payload.courseId,
      course_name: payload.courseName,
      tee_id: payload.teeId,
      tee_name: payload.teeName,
    })
    .eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not relink round course.");
}

export async function startFreePlayRound(roundId: string): Promise<void> {
  const { error } = await supabase
    .from("free_play_rounds")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not start round.");
}

export async function completeFreePlayRound(roundId: string): Promise<void> {
  const { error } = await supabase
    .from("free_play_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not complete round.");
}

export async function reopenFreePlayRound(roundId: string): Promise<void> {
  const { error } = await supabase
    .from("free_play_rounds")
    .update({ status: "in_progress", completed_at: null })
    .eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not reopen round.");
}

export async function deleteFreePlayRound(roundId: string): Promise<void> {
  const { error } = await supabase.from("free_play_rounds").delete().eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not delete round.");
}

export async function saveQuickTotals(
  roundId: string,
  entries: Array<{ roundPlayerId: string; quickTotal: number | null }>,
): Promise<void> {
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    round_id: roundId,
    round_player_id: e.roundPlayerId,
    quick_total: e.quickTotal == null ? null : Number(e.quickTotal),
    holes_played: 18,
  }));
  const { error } = await supabase.from("free_play_round_scores").upsert(rows, { onConflict: "round_id,round_player_id" });
  if (error) throw toFreePlayError(error, "Could not save quick scores.");
}

async function syncPlayerAggregateFromHoles(roundId: string, roundPlayerId: string): Promise<void> {
  const { data: rows, error } = await supabase
    .from("free_play_round_hole_scores")
    .select("gross_strokes")
    .eq("round_id", roundId)
    .eq("round_player_id", roundPlayerId);
  if (error) throw toFreePlayError(error, "Could not read hole scores.");
  const scored = (rows ?? []).filter((r: { gross_strokes: unknown }) => r.gross_strokes != null && Number.isFinite(Number(r.gross_strokes)));
  const holesPlayed = scored.length;
  const total = scored.reduce((sum: number, r: { gross_strokes: unknown }) => sum + Number(r.gross_strokes), 0);
  const { error: scoreErr } = await supabase.from("free_play_round_scores").upsert(
    {
      round_id: roundId,
      round_player_id: roundPlayerId,
      quick_total: holesPlayed > 0 ? total : null,
      holes_played: holesPlayed,
    },
    { onConflict: "round_id,round_player_id" },
  );
  if (scoreErr) throw toFreePlayError(scoreErr, "Could not update round total.");
}

/** Replace all hole scores for one player (bulk save). */
export async function replaceHoleScores(
  roundId: string,
  roundPlayerId: string,
  holes: Array<{ holeNumber: number; grossStrokes: number | null }>,
): Promise<void> {
  const { error: delErr } = await supabase
    .from("free_play_round_hole_scores")
    .delete()
    .eq("round_id", roundId)
    .eq("round_player_id", roundPlayerId);
  if (delErr) throw toFreePlayError(delErr, "Could not clear hole scores.");

  const filtered = holes.filter(
    (h) => Number.isFinite(h.holeNumber) && (h.grossStrokes === null || Number.isFinite(Number(h.grossStrokes))),
  );
  if (filtered.length) {
    const { error: upsertErr } = await supabase.from("free_play_round_hole_scores").upsert(
      filtered.map((h) => ({
        round_id: roundId,
        round_player_id: roundPlayerId,
        hole_number: h.holeNumber,
        gross_strokes: h.grossStrokes == null ? null : Number(h.grossStrokes),
      })),
      { onConflict: "round_id,round_player_id,hole_number" },
    );
    if (upsertErr) throw toFreePlayError(upsertErr, "Could not save hole scores.");
  }
  await syncPlayerAggregateFromHoles(roundId, roundPlayerId);
}

/** Upsert one hole score (null gross = pickup / NR). */
export async function upsertHoleScore(
  roundId: string,
  roundPlayerId: string,
  holeNumber: number,
  grossStrokes: number | null,
): Promise<void> {
  if (!Number.isFinite(holeNumber)) return;
  const { error } = await supabase.from("free_play_round_hole_scores").upsert(
    {
      round_id: roundId,
      round_player_id: roundPlayerId,
      hole_number: holeNumber,
      gross_strokes: grossStrokes == null ? null : Number(grossStrokes),
    },
    { onConflict: "round_id,round_player_id,hole_number" },
  );
  if (error) throw toFreePlayError(error, "Could not save hole score.");
  await syncPlayerAggregateFromHoles(roundId, roundPlayerId);
}

export async function joinFreePlayRoundByCode(code: string, displayName?: string): Promise<FreePlayRound> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) throw new Error("Enter a join code.");
  await requireAuthUserId();

  const { data: rpcRow, error: rpcErr } = await supabase.rpc("join_free_play_round_by_code", {
    p_join_code: cleanCode,
    p_display_name: displayName?.trim() ?? "",
  });
  if (!rpcErr && rpcRow) {
    const row = Array.isArray(rpcRow) ? rpcRow[0] : rpcRow;
    if (row) return mapRound(row as Record<string, unknown>);
  }

  const legacyMsg = String((rpcErr as { message?: string } | null)?.message ?? "").toLowerCase();
  if (!legacyMsg.includes("function") && !legacyMsg.includes("schema cache") && !legacyMsg.includes("does not exist")) {
    throw toFreePlayError(rpcErr, "Could not join round.");
  }

  const { data: roundRow, error: roundErr } = await supabase.from("free_play_rounds").select("*").eq("join_code", cleanCode).single();
  if (roundErr || !roundRow) throw toFreePlayError(roundErr, "Round not found for that code.");
  const round = mapRound(roundRow as Record<string, unknown>);
  const uid = await requireAuthUserId();
  const { data: existing, error: existingErr } = await supabase
    .from("free_play_round_players")
    .select("id")
    .eq("round_id", round.id)
    .eq("user_id", uid)
    .maybeSingle();
  if (existingErr) throw toFreePlayError(existingErr, "Could not join round.");
  if (!existing) {
    const name = displayName?.trim() || "App Player";
    const { error: insErr } = await supabase.from("free_play_round_players").insert({
      round_id: round.id,
      player_type: "app_user",
      user_id: uid,
      display_name: name,
      invite_status: "joined",
      handicap_index: 0,
      playing_handicap: 0,
      is_owner: false,
    });
    if (insErr) throw toFreePlayError(insErr, "Could not join round.");
  }
  return round;
}

export async function addFreePlayRoundPlayer(
  roundId: string,
  player: {
    playerType: "member" | "app_user" | "guest";
    displayName: string;
    memberId?: string | null;
    userId?: string | null;
    inviteEmail?: string | null;
    handicapIndex?: number | null;
    courseHandicap?: number | null;
    playingHandicap?: number | null;
    handicapSource?: "auto" | "manual" | null;
    guestName?: string | null;
    teeId?: string | null;
    inviteStatus?: "none" | "invited" | "joined";
  },
): Promise<void> {
  const hi = Number.isFinite(Number(player.handicapIndex)) ? Number(player.handicapIndex) : 0;
  const ch = Number.isFinite(Number(player.courseHandicap)) ? Number(player.courseHandicap) : hi;
  const ph = Number.isFinite(Number(player.playingHandicap)) ? Number(player.playingHandicap) : hi;
  const { error } = await supabase.from("free_play_round_players").insert({
    round_id: roundId,
    player_type: player.playerType,
    member_id: player.memberId ?? null,
    user_id: player.userId ?? null,
    invite_email: player.inviteEmail ?? null,
    display_name: player.displayName.trim(),
    handicap_index: hi,
    course_handicap: Math.round(ch),
    playing_handicap: Math.round(ph),
    handicap_source: player.handicapSource ?? "auto",
    guest_name: player.guestName?.trim() || (player.playerType === "guest" ? player.displayName.trim() : null),
    tee_id: player.teeId ?? null,
    invite_status: player.inviteStatus ?? "none",
  });
  if (error) throw toFreePlayError(error, "Could not add player.");
}

export async function removeFreePlayRoundPlayer(roundId: string, roundPlayerId: string): Promise<void> {
  const { error } = await supabase
    .from("free_play_round_players")
    .delete()
    .eq("round_id", roundId)
    .eq("id", roundPlayerId);
  if (error) throw toFreePlayError(error, "Could not remove player.");
}
