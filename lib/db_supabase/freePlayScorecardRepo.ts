import { supabase } from "@/lib/supabase";
import type {
  FreePlayRound,
  FreePlayRoundBundle,
  FreePlayRoundHoleScore,
  FreePlayRoundPlayer,
  FreePlayRoundScore,
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
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    e.code === "42501" ||
    msg.includes("forbidden") ||
    msg.includes("permission denied") ||
    msg.includes("row-level security")
  );
}

function toFreePlayError(error: unknown, fallback: string): Error {
  if (isFreePlayPermissionDenied(error)) {
    return new Error(
      "Free Play access is blocked by row-level security policies. Run the latest Free Play RLS fix migration (`123`/`124`) in Supabase.",
    );
  }
  if (isFreePlaySchemaMissing(error)) {
    return new Error(
      "Free Play tables are missing in this database. Run migration `122_free_play_scorecards.sql` and reload Supabase API schema.",
    );
  }
  const e = error as { message?: string } | null;
  return new Error(e?.message || fallback);
}

type CreateRoundInput = {
  societyId?: string | null;
  createdByMemberId?: string | null;
  courseId?: string | null;
  courseName: string;
  teeId?: string | null;
  teeName?: string | null;
  scoringMode?: FreePlayScoringMode;
  players: Array<{
    playerType: "member" | "app_user" | "guest";
    displayName: string;
    memberId?: string | null;
    userId?: string | null;
    inviteEmail?: string | null;
    handicapIndex?: number | null;
    inviteStatus?: "none" | "invited" | "joined";
    isOwner?: boolean;
    sortOrder?: number;
  }>;
};

function mapRound(row: any): FreePlayRound {
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
    status: row.status === "completed" ? "completed" : row.status === "in_progress" ? "in_progress" : "draft",
    started_at: row.started_at ? String(row.started_at) : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapRoundPlayer(row: any): FreePlayRoundPlayer {
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    player_type: row.player_type,
    member_id: row.member_id ? String(row.member_id) : null,
    user_id: row.user_id ? String(row.user_id) : null,
    invite_email: row.invite_email ? String(row.invite_email) : null,
    display_name: String(row.display_name ?? "Player"),
    handicap_index: Number.isFinite(Number(row.handicap_index)) ? Number(row.handicap_index) : 0,
    invite_status: row.invite_status === "invited" ? "invited" : row.invite_status === "joined" ? "joined" : "none",
    is_owner: row.is_owner === true,
    sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapScore(row: any): FreePlayRoundScore {
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

function mapHoleScore(row: any): FreePlayRoundHoleScore {
  return {
    id: String(row.id),
    round_id: String(row.round_id),
    round_player_id: String(row.round_player_id),
    hole_number: Number(row.hole_number),
    gross_strokes: Number(row.gross_strokes),
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

  const joinedRoundIds = [...new Set((joinedRows ?? []).map((r: any) => String(r.round_id)).filter(Boolean))];
  if (joinedRoundIds.length === 0) return (mine ?? []).map(mapRound);

  const { data: joinedRounds, error } = await supabase
    .from("free_play_rounds")
    .select("*")
    .in("id", joinedRoundIds)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw toFreePlayError(error, "Failed to load free-play rounds.");

  const merged = [...(mine ?? []), ...(joinedRounds ?? [])];
  const byId = new Map<string, any>();
  for (const row of merged) byId.set(String(row.id), row);
  return [...byId.values()].map(mapRound).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
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
    round: mapRound(roundRow),
    players: (playersRows ?? []).map(mapRoundPlayer),
    scores: (scoreRows ?? []).map(mapScore),
    holeScores: (holeRows ?? []).map(mapHoleScore),
  };
}

export async function createFreePlayRound(input: CreateRoundInput): Promise<FreePlayRound> {
  const uid = await requireAuthUserId();
  const { data: roundRow, error: roundError } = await supabase
    .from("free_play_rounds")
    .insert({
      society_id: input.societyId ?? null,
      created_by_user_id: uid,
      created_by_member_id: input.createdByMemberId ?? null,
      course_id: input.courseId ?? null,
      course_name: input.courseName.trim(),
      tee_id: input.teeId ?? null,
      tee_name: input.teeName ?? null,
      scoring_mode: input.scoringMode ?? "quick",
      status: "draft",
    })
    .select("*")
    .single();
  if (roundError || !roundRow) throw toFreePlayError(roundError, "Could not create free-play round.");

  const roundId = String(roundRow.id);
  const playerRows = input.players
    .filter((p) => p.displayName?.trim())
    .map((p, i) => ({
      round_id: roundId,
      player_type: p.playerType,
      member_id: p.memberId ?? null,
      user_id: p.userId ?? null,
      invite_email: p.inviteEmail ?? null,
      display_name: p.displayName.trim(),
      handicap_index: Number.isFinite(Number(p.handicapIndex)) ? Number(p.handicapIndex) : 0,
      invite_status: p.inviteStatus ?? "none",
      is_owner: p.isOwner === true,
      sort_order: Number.isFinite(Number(p.sortOrder)) ? Number(p.sortOrder) : i,
    }));
  if (playerRows.length > 0) {
    const { error } = await supabase.from("free_play_round_players").insert(playerRows);
    if (error) throw toFreePlayError(error, "Could not save free-play players.");
  }

  return mapRound(roundRow);
}

export async function updateFreePlayPlayerHandicap(roundPlayerId: string, handicapIndex: number): Promise<void> {
  const h = Number.isFinite(Number(handicapIndex)) ? Number(handicapIndex) : 0;
  const { error } = await supabase
    .from("free_play_round_players")
    .update({ handicap_index: h })
    .eq("id", roundPlayerId);
  if (error) throw toFreePlayError(error, "Could not update handicap.");
}

export async function setFreePlayRoundMode(roundId: string, mode: FreePlayScoringMode): Promise<void> {
  const { error } = await supabase.from("free_play_rounds").update({ scoring_mode: mode }).eq("id", roundId);
  if (error) throw toFreePlayError(error, "Could not change scoring mode.");
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
  const { error } = await supabase
    .from("free_play_round_scores")
    .upsert(rows, { onConflict: "round_id,round_player_id" });
  if (error) throw toFreePlayError(error, "Could not save quick scores.");
}

export async function replaceHoleScores(
  roundId: string,
  roundPlayerId: string,
  holes: Array<{ holeNumber: number; grossStrokes: number }>,
): Promise<void> {
  const { error: delErr } = await supabase
    .from("free_play_round_hole_scores")
    .delete()
    .eq("round_id", roundId)
    .eq("round_player_id", roundPlayerId);
  if (delErr) throw toFreePlayError(delErr, "Could not clear hole scores.");

  const filtered = holes.filter((h) => Number.isFinite(h.holeNumber) && Number.isFinite(h.grossStrokes));
  if (filtered.length) {
    const { error: upsertErr } = await supabase.from("free_play_round_hole_scores").upsert(
      filtered.map((h) => ({
        round_id: roundId,
        round_player_id: roundPlayerId,
        hole_number: h.holeNumber,
        gross_strokes: h.grossStrokes,
      })),
      { onConflict: "round_id,round_player_id,hole_number" },
    );
    if (upsertErr) throw toFreePlayError(upsertErr, "Could not save hole scores.");
  }

  const total = filtered.reduce((sum, h) => sum + Number(h.grossStrokes || 0), 0);
  const { error: scoreErr } = await supabase.from("free_play_round_scores").upsert(
    {
      round_id: roundId,
      round_player_id: roundPlayerId,
      quick_total: filtered.length ? total : null,
      holes_played: filtered.length,
    },
    { onConflict: "round_id,round_player_id" },
  );
  if (scoreErr) throw toFreePlayError(scoreErr, "Could not update round total.");
}

export async function joinFreePlayRoundByCode(code: string, displayName?: string): Promise<FreePlayRound> {
  const uid = await requireAuthUserId();
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) throw new Error("Enter a join code.");

  const { data: roundRow, error: roundErr } = await supabase
    .from("free_play_rounds")
    .select("*")
    .eq("join_code", cleanCode)
    .single();
  if (roundErr || !roundRow) throw toFreePlayError(roundErr, "Round not found for that code.");
  const round = mapRound(roundRow);

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
    inviteStatus?: "none" | "invited" | "joined";
  },
): Promise<void> {
  const { error } = await supabase.from("free_play_round_players").insert({
    round_id: roundId,
    player_type: player.playerType,
    member_id: player.memberId ?? null,
    user_id: player.userId ?? null,
    invite_email: player.inviteEmail ?? null,
    display_name: player.displayName.trim(),
    handicap_index: Number.isFinite(Number(player.handicapIndex)) ? Number(player.handicapIndex) : 0,
    invite_status: player.inviteStatus ?? "none",
  });
  if (error) throw toFreePlayError(error, "Could not add player.");
}
