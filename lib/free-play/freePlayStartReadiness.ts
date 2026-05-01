import { strictScorecardReadyForTee, type ScorecardReadyHoleInput, type ScorecardReadyTeeInput } from "@/lib/course/scorecardReadyCourse";
import type { CourseHoleRow, CourseTee } from "@/lib/db_supabase/courseRepo";
import type { FreePlayRoundBundle } from "@/types/freePlayScorecard";

export type FreePlayStartReadinessContext = {
  bundle: FreePlayRoundBundle;
  teeMeta: CourseTee | null;
  holeMeta: CourseHoleRow[];
};

/**
 * Human-readable blockers before moving a draft round to `in_progress`.
 * Requires strict same-tee scorecard data (18 holes, par, SI permutation) so net/Stableford stay reliable.
 */
export function getFreePlayStartBlockers(ctx: FreePlayStartReadinessContext): string[] {
  const { bundle, teeMeta, holeMeta } = ctx;
  const out: string[] = [];

  if (!bundle.round.course_id?.trim()) {
    out.push("Select a course before starting.");
  }
  if (!bundle.round.tee_id?.trim()) {
    out.push("Select a tee before starting.");
  }
  if (bundle.players.length < 1) {
    out.push("Add at least one player.");
  }

  for (const p of bundle.players) {
    const hi = Number(p.handicap_index);
    if (!Number.isFinite(hi) || hi < -10 || hi > 54) {
      out.push(`Invalid handicap index for ${p.display_name}. Use a number between -10 and 54.`);
    }
  }

  if (!teeMeta) {
    out.push("Tee data is still loading or missing. Wait for metadata or pick another tee.");
    return out;
  }

  const cr = Number(teeMeta.course_rating);
  const slope = Number(teeMeta.slope_rating);
  const par = Number(teeMeta.par_total);
  if (!(Number.isFinite(cr) && cr > 0)) out.push("Selected tee is missing a valid course rating.");
  if (!(Number.isFinite(slope) && slope > 0)) out.push("Selected tee is missing a valid slope rating.");
  if (!(Number.isFinite(par) && par > 0)) out.push("Selected tee is missing a valid par total.");

  if (holeMeta.length < 18) {
    out.push(`This tee needs 18 holes in the database (currently ${holeMeta.length}).`);
  }

  const teeInput: ScorecardReadyTeeInput & { id: string } = {
    id: teeMeta.id,
    is_active: teeMeta.is_active !== false,
    course_rating: teeMeta.course_rating,
    slope_rating: teeMeta.slope_rating,
    par_total: teeMeta.par_total,
  };
  const holesInput: ScorecardReadyHoleInput[] = holeMeta.map((h) => ({
    hole_number: h.hole_number,
    par: h.par,
    stroke_index: h.stroke_index,
  }));

  if (holeMeta.length >= 18 && !strictScorecardReadyForTee(teeInput, holesInput)) {
    out.push(
      "Tee scorecard data is incomplete: need holes 1–18 with par, stroke index 1–18 on each hole, and no duplicate stroke indexes.",
    );
  }

  return out;
}
