import type { CourseTee } from "@/lib/db_supabase/courseRepo";

/**
 * Split imported course tees for male vs female selection.
 * Ambiguous rows (no gender / unknown) appear in BOTH pickers so captains can assign either.
 */
export function partitionTeesByGender(tees: CourseTee[]): {
  men: CourseTee[];
  ladies: CourseTee[];
  ambiguous: CourseTee[];
} {
  const men: CourseTee[] = [];
  const ladies: CourseTee[] = [];
  const ambiguous: CourseTee[] = [];
  for (const t of tees) {
    const gu = (t.gender || "").trim().toUpperCase();
    const nm = (t.tee_name || "").toLowerCase();
    if (gu === "F" || /\bladies\b/.test(nm) || nm.includes("(ladies)")) {
      ladies.push(t);
    } else if (gu === "M") {
      men.push(t);
    } else {
      ambiguous.push(t);
    }
  }
  return { men, ladies, ambiguous };
}

function uniqById(tees: CourseTee[]): CourseTee[] {
  const m = new Map<string, CourseTee>();
  for (const t of tees) m.set(t.id, t);
  return [...m.values()];
}

/** Tees offered for men's vs ladies' pickers (ambiguous tees appear in both). */
export function menAndLadiesTeeOptions(tees: CourseTee[]): {
  menOptions: CourseTee[];
  ladiesOptions: CourseTee[];
} {
  const { men, ladies, ambiguous } = partitionTeesByGender(tees);
  return {
    menOptions: uniqById([...men, ...ambiguous]),
    ladiesOptions: uniqById([...ladies, ...ambiguous]),
  };
}

/** Try to match saved ladies' numbers to a course_tees row. */
export function matchLadiesTeeFromEvent(
  tees: CourseTee[],
  opts: {
    ladiesTeeName?: string | null;
    ladiesPar?: number | null;
    ladiesCourseRating?: number | null;
    ladiesSlopeRating?: number | null;
  },
): CourseTee | null {
  const name = (opts.ladiesTeeName || "").trim().toLowerCase();
  if (name) {
    const byName = tees.find((t) => (t.tee_name || "").trim().toLowerCase() === name);
    if (byName) return byName;
  }
  const p = opts.ladiesPar;
  const cr = opts.ladiesCourseRating;
  const sr = opts.ladiesSlopeRating;
  if (p == null && cr == null && sr == null) return null;
  return (
    tees.find(
      (t) =>
        (p == null || t.par_total === p) &&
        (cr == null || Math.abs(t.course_rating - cr) < 0.05) &&
        (sr == null || t.slope_rating === sr),
    ) ?? null
  );
}

export function hasManualLadiesTeeMinimum(opts: {
  manualLadiesTeeName: string;
  manualLadiesPar: string;
  manualLadiesCourseRating: string;
  manualLadiesSlopeRating: string;
}): boolean {
  return (
    opts.manualLadiesTeeName.trim().length > 0 &&
    opts.manualLadiesPar.trim().length > 0 &&
    opts.manualLadiesCourseRating.trim().length > 0 &&
    opts.manualLadiesSlopeRating.trim().length > 0
  );
}
