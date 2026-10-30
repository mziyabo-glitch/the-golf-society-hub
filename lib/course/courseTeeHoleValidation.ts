/**
 * Validates live tee hole rows before copying into `event_course_holes`.
 * Standalone module (no Supabase / React Native) so Vitest can import it safely.
 */

export type TeeHoleRowLike = {
  hole_number: number;
  par: number | null;
  yardage: number | null;
  stroke_index: number | null;
};

export function assertLiveTeeHolesValidForEventAttach(holes: TeeHoleRowLike[]): void {
  const n = holes.length;
  if (n !== 9 && n !== 18) {
    throw new Error(`attachCourseAndTeeToEvent: tee has ${n} holes; scoring requires exactly 9 or 18 with full par, yardage, and stroke index.`);
  }
  for (const h of holes) {
    if (h.par == null || !Number.isFinite(Number(h.par)) || !Number.isInteger(Number(h.par))) {
      throw new Error(`attachCourseAndTeeToEvent: hole ${h.hole_number} has invalid or missing par.`);
    }
    if (h.yardage == null || !Number.isFinite(Number(h.yardage)) || !Number.isInteger(Number(h.yardage)) || Number(h.yardage) < 1) {
      throw new Error(`attachCourseAndTeeToEvent: hole ${h.hole_number} has invalid or missing yardage.`);
    }
    if (h.stroke_index == null || !Number.isFinite(Number(h.stroke_index)) || !Number.isInteger(Number(h.stroke_index))) {
      throw new Error(`attachCourseAndTeeToEvent: hole ${h.hole_number} has invalid or missing stroke_index.`);
    }
  }
}
