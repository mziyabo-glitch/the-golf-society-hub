/**
 * Dev/QA helpers to verify Free Play scorecard data flows (tees → holes → handicap → leaderboard)
 * without changing scoring rules. Shrivenham Park GC Summer gets a structured checklist.
 */

import type { CourseHoleRow, CourseTee } from "@/lib/db_supabase/courseRepo";
import { intPlayingHandicap } from "@/lib/scoring/freePlayScoring";
import type { FreePlayRoundBundle } from "@/types/freePlayScorecard";

export const SHRIVENHAM_PARK_GC_SUMMER_QA_NAME_SUBSTR = "Shrivenham Park GC Summer";

export function isShrivenhamParkGcSummerQaCourse(courseName: string | null | undefined): boolean {
  const n = String(courseName ?? "").trim();
  return n.includes(SHRIVENHAM_PARK_GC_SUMMER_QA_NAME_SUBSTR);
}

function countHolesMissingStrokeIndex(holes: readonly Pick<CourseHoleRow, "stroke_index">[]): number {
  return holes.filter((h) => !(Number.isFinite(Number(h.stroke_index)) && Number(h.stroke_index) > 0)).length;
}

function teeHasRatingSlopePar(tee: CourseTee | null): boolean {
  if (!tee) return false;
  const slope = tee.slope_rating;
  const cr = tee.course_rating;
  const par = tee.par_total;
  return (
    Number.isFinite(Number(slope)) &&
    Number(slope) > 0 &&
    Number.isFinite(Number(cr)) &&
    Number.isFinite(Number(par)) &&
    Number(par) > 0
  );
}

/** Setup screen: tees/holes loaded via courseRepo (course_tees / course_holes). */
export function logFreePlayShrivenhamSetupDataPathQa(input: {
  courseId: string | null;
  courseName: string;
  tees: readonly CourseTee[];
  selectedTeeId: string | null;
  setupHoles: readonly CourseHoleRow[];
}): void {
  if (!isShrivenhamParkGcSummerQaCourse(input.courseName)) return;

  const selectedTee = input.selectedTeeId ? input.tees.find((t) => t.id === input.selectedTeeId) ?? null : null;
  const chReady = teeHasRatingSlopePar(selectedTee);
  const missingSi = countHolesMissingStrokeIndex(input.setupHoles);

  const checklist = {
    phase: "free-play-setup",
    course: input.courseId ? `ok (course_id=${input.courseId})` : "FAIL — no course id",
    teesFromCourseTees:
      input.tees.length > 0
        ? `ok — ${input.tees.length} row(s) from getTeesByCourseId → course_tees`
        : "FAIL — no tees from course_tees for this course",
    holesFromCourseHoles:
      !input.selectedTeeId
        ? "pending — pick a tee"
        : input.setupHoles.length > 0
          ? `ok — ${input.setupHoles.length} row(s) from getHolesByTeeId → course_holes`
          : "FAIL — no holes from course_holes for selected tee",
    ratingSlopeParForCourseHandicap: selectedTee
      ? chReady
        ? `ok — course_rating=${selectedTee.course_rating} slope_rating=${selectedTee.slope_rating} par_total=${selectedTee.par_total} (calculateCourseHandicap path)`
        : "FAIL — course_rating / slope_rating / par_total incomplete for WHS course handicap"
      : "pending — no tee",
    strokeIndexForNetStrokesAndStableford:
      input.setupHoles.length === 0
        ? "pending — no holes loaded"
        : missingSi === 0
          ? "ok — stroke_index present on all loaded holes"
          : `FAIL — ${missingSi} hole(s) missing stroke_index (net/SF will use fallback order)`,
  };

  console.log(`[free-play:qa] ${SHRIVENHAM_PARK_GC_SUMMER_QA_NAME_SUBSTR} — setup data path\n`, checklist);

  if (!input.courseId) console.warn("[free-play:qa] Missing course id on selected hit.");
  if (input.tees.length === 0) console.warn("[free-play:qa] No tees from course_tees — check course_tees for this course_id.");
  if (input.selectedTeeId && input.setupHoles.length === 0) {
    console.warn("[free-play:qa] No holes from course_holes for tee_id=", input.selectedTeeId);
  }
  if (selectedTee && !chReady) {
    console.warn("[free-play:qa] Tee missing usable rating/slope/par for course handicap:", {
      tee_id: selectedTee.id,
      course_rating: selectedTee.course_rating,
      slope_rating: selectedTee.slope_rating,
      par_total: selectedTee.par_total,
    });
  }
  if (input.setupHoles.length > 0 && missingSi > 0) {
    console.warn(`[free-play:qa] ${missingSi} hole(s) missing stroke_index in course_holes for this tee.`);
  }
}

/** Scorecard screen after course/tee/hole hydration. */
export function logFreePlayScorecardDataPathQa(input: {
  bundle: FreePlayRoundBundle;
  teeMeta: CourseTee | null;
  holeMeta: readonly CourseHoleRow[];
  metaHydrating: boolean;
}): void {
  const { bundle, teeMeta, holeMeta, metaHydrating } = input;
  if (metaHydrating) return;

  const round = bundle.round;
  const courseName = String(round.course_name ?? "");
  const shrivenham = isShrivenhamParkGcSummerQaCourse(courseName);

  if (!round.course_id) {
    console.warn("[free-play:qa] Round missing course_id — cannot load course_tees/course_holes from DB.");
  }

  if (round.course_id && !teeMeta) {
    console.warn("[free-play:qa] No tee metadata resolved — check round.tee_id and course_tees.", {
      round_id: round.id,
      course_id: round.course_id,
      round_tee_id: round.tee_id,
    });
  }

  if (teeMeta && !teeHasRatingSlopePar(teeMeta)) {
    console.warn("[free-play:qa] Resolved tee missing usable rating/slope/par for course handicap:", {
      tee_id: teeMeta.id,
      course_rating: teeMeta.course_rating,
      slope_rating: teeMeta.slope_rating,
      par_total: teeMeta.par_total,
    });
  }

  if (round.course_id && teeMeta && holeMeta.length === 0) {
    console.warn("[free-play:qa] Tee resolved but no course_holes rows — check course_holes for tee_id=", teeMeta.id);
  }

  const missingSi = countHolesMissingStrokeIndex(holeMeta);
  if (holeMeta.length > 0 && missingSi > 0) {
    console.warn(
      `[free-play:qa] ${missingSi} hole(s) missing stroke_index — buildStrokesReceivedByHole / Stableford may not match card.`,
    );
  }

  if (!shrivenham) return;

  const chReady = teeHasRatingSlopePar(teeMeta);
  const leaderboardHcp = bundle.players.map((p) => ({
    round_player_id: p.id,
    display_name: p.display_name,
    handicap_index: p.handicap_index,
    playing_handicap_stored: p.playing_handicap,
    /** Same normalization as buildFreePlayLeaderboard → buildStrokesReceivedByHole */
    int_playing_handicap_for_leaderboard: intPlayingHandicap(p.playing_handicap, p.handicap_index),
  }));

  const checklist = {
    phase: "free-play-scorecard",
    course: round.course_id ? `ok (course_id=${round.course_id})` : "FAIL — round.course_id null",
    teeFromCourseTees: teeMeta
      ? `ok — tee_id=${teeMeta.id} (${teeMeta.tee_name}) from getCourseTeeById / getTeesByCourseId`
      : "FAIL — teeMeta null",
    holesFromCourseHoles:
      holeMeta.length > 0
        ? `ok — ${holeMeta.length} row(s) from getHolesByTeeId → course_holes`
        : "FAIL — no holes",
    ratingSlopeParForCourseHandicap: teeMeta
      ? chReady
        ? `ok — CR/slope/par present (deriveCourseAndPlayingHandicapFromHi / calculateCourseHandicap)`
        : "FAIL — incomplete tee ratings"
      : "FAIL — no tee",
    strokeIndexForNetStrokesAndStableford:
      holeMeta.length === 0
        ? "pending"
        : missingSi === 0
          ? "ok — stroke_index on all holes → freePlayHolesToSnapshots"
          : `FAIL — ${missingSi} holes missing SI`,
    leaderboardUsesNormalizedPlayingHandicap: `ok — buildFreePlayLeaderboard uses intPlayingHandicap(playing_handicap, handicap_index); see players[]`,
    players: leaderboardHcp,
  };

  console.log(`[free-play:qa] ${SHRIVENHAM_PARK_GC_SUMMER_QA_NAME_SUBSTR} — scorecard data path\n`, checklist);
}
