/**
 * Read-only catalog audit against the connected Supabase project (service role).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npm run course-catalog:audit
 *   npm run course-catalog:audit -- --limit=1000 --out=reports/course-catalog-audit.md
 *
 * Does not modify import behaviour or live course rows.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type CourseRow = {
  id: string;
  course_name: string | null;
  club_name: string | null;
  api_id: number | null;
  canonical_api_id: number | null;
  territory: string | null;
  golfer_data_status: string | null;
  validation_basis: string | null;
  data_confidence: string | null;
  enrichment_status: string | null;
  dedupe_key: string | null;
};

type TeeRow = {
  id: string;
  course_id: string;
  course_rating: number | null;
  slope_rating: number | null;
  par_total: number | null;
  is_active: boolean | null;
  is_default: boolean | null;
  display_order: number | null;
};

type HoleRow = {
  tee_id: string;
  hole_number: number;
  par: number | null;
  stroke_index: number | null;
};

/** Free Play visibility bucket (audit / recommendation only). */
export type FreePlayVisibilityClass =
  | "READY_FOR_FREE_PLAY"
  | "NEEDS_TEE_DATA"
  | "NEEDS_HOLE_DATA"
  | "NEEDS_STROKE_INDEX"
  | "NEEDS_RATING_SLOPE"
  | "DUPLICATE_REVIEW";

function requireSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isTeeActive(row: TeeRow): boolean {
  return row.is_active !== false;
}

function teeHasRatingBlock(t: TeeRow): boolean {
  return (
    t.course_rating != null &&
    Number.isFinite(Number(t.course_rating)) &&
    Number(t.course_rating) > 0 &&
    t.slope_rating != null &&
    Number.isFinite(Number(t.slope_rating)) &&
    Number(t.slope_rating) > 0 &&
    t.par_total != null &&
    Number.isFinite(Number(t.par_total)) &&
    Number(t.par_total) > 0
  );
}

/** Holes 1–18 present; each has par > 0. Does not check stroke index. */
function hasEighteenHolesWithPar(holeRows: HoleRow[]): boolean {
  const byN = new Map<number, HoleRow>();
  for (const h of holeRows) {
    if (!byN.has(h.hole_number)) byN.set(h.hole_number, h);
  }
  for (let n = 1; n <= 18; n++) {
    const h = byN.get(n);
    if (!h) return false;
    if (!(Number.isFinite(Number(h.par)) && Number(h.par) > 0)) return false;
  }
  return true;
}

/**
 * Strict scorecard-ready on THIS tee (same tee must carry ratings + holes):
 * - active tee
 * - course_rating, slope_rating, par_total all present and > 0
 * - holes 1..18 each present
 * - each hole par > 0
 * - each stroke_index integer in 1..18
 * - 18 distinct stroke indexes (no duplicates)
 */
function strictScorecardReadyForTee(tee: TeeRow, holeRows: HoleRow[]): boolean {
  if (!isTeeActive(tee) || !teeHasRatingBlock(tee)) return false;
  const byN = new Map<number, HoleRow>();
  for (const h of holeRows) {
    if (!byN.has(h.hole_number)) byN.set(h.hole_number, h);
  }
  const sis: number[] = [];
  for (let n = 1; n <= 18; n++) {
    const h = byN.get(n);
    if (!h) return false;
    if (!(Number.isFinite(Number(h.par)) && Number(h.par) > 0)) return false;
    const si = Number(h.stroke_index);
    if (!Number.isFinite(si) || !Number.isInteger(si) || si < 1 || si > 18) return false;
    sis.push(si);
  }
  return new Set(sis).size === 18;
}

function courseHasStrictReadyTee(activeTees: TeeRow[], holesByTee: Map<string, HoleRow[]>): boolean {
  for (const t of activeTees) {
    const rows = holesByTee.get(t.id) ?? [];
    if (strictScorecardReadyForTee(t, rows)) return true;
  }
  return false;
}

function analyzeHoles(rows: HoleRow[]): {
  holeCount: number;
  siComplete: boolean;
  missingSi: number;
  missingPar: number;
} {
  const sorted = [...rows].sort((a, b) => a.hole_number - b.hole_number);
  const holeCount = sorted.length;
  let missingSi = 0;
  let missingPar = 0;
  for (const h of sorted) {
    if (!(Number.isFinite(Number(h.stroke_index)) && Number(h.stroke_index) > 0)) missingSi += 1;
    if (!(Number.isFinite(Number(h.par)) && Number(h.par) > 0)) missingPar += 1;
  }
  const siComplete = holeCount >= 18 && missingSi === 0;
  return { holeCount, siComplete, missingSi, missingPar };
}

function pickPrimaryTee(tees: TeeRow[]): TeeRow | null {
  const active = tees.filter(isTeeActive);
  if (active.length === 0) return null;
  const def = active.find((t) => t.is_default === true);
  if (def) return def;
  const sorted = [...active].sort((a, b) => {
    const da = a.display_order != null && Number.isFinite(a.display_order) ? Number(a.display_order) : 999;
    const db = b.display_order != null && Number.isFinite(b.display_order) ? Number(b.display_order) : 999;
    if (da !== db) return da - db;
    return String(a.id).localeCompare(String(b.id));
  });
  return sorted[0] ?? null;
}

function displayName(c: CourseRow): string {
  return String(c.course_name ?? "").trim() || String(c.club_name ?? "").trim() || "(no name)";
}

function normalizeNameKey(display: string): string {
  return display.trim().toLowerCase().replace(/\s+/g, " ");
}

async function fetchPaged<T>(supabase: SupabaseClient, table: string, select: string, pageSize: number): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function safeCount(supabase: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

function classifyFreePlayVisibility(params: {
  isDuplicateName: boolean;
  strictReady: boolean;
  activeTees: TeeRow[];
  holesByTee: Map<string, HoleRow[]>;
}): FreePlayVisibilityClass {
  if (params.isDuplicateName) return "DUPLICATE_REVIEW";
  if (params.strictReady) return "READY_FOR_FREE_PLAY";
  const { activeTees, holesByTee } = params;
  if (activeTees.length === 0) return "NEEDS_TEE_DATA";
  const hasRated = activeTees.some(teeHasRatingBlock);
  if (!hasRated) return "NEEDS_RATING_SLOPE";
  const hasAnyHole = activeTees.some((t) => (holesByTee.get(t.id) ?? []).length > 0);
  if (!hasAnyHole) return "NEEDS_HOLE_DATA";
  const ratedWith18Par = activeTees.filter(teeHasRatingBlock).some((t) => {
    const rows = holesByTee.get(t.id) ?? [];
    return hasEighteenHolesWithPar(rows);
  });
  if (!ratedWith18Par) return "NEEDS_HOLE_DATA";
  return "NEEDS_STROKE_INDEX";
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 200;
  let outPath: string | null = null;
  for (const a of args) {
    if (a.startsWith("--limit=")) limit = Math.max(1, Math.min(5000, Number(a.split("=")[1]) || 200));
    if (a.startsWith("--out=")) outPath = a.split("=").slice(1).join("=").trim() || null;
  }

  const supabase = requireSupabase();

  const lines: string[] = [];

  const push = (s: string) => {
    lines.push(s);
    console.log(s);
  };

  push("# Course catalog audit (live `courses` / `course_tees` / `course_holes`)");
  push("");
  push("## Meaning of “site” in this codebase");
  push("");
  push("| Term | Meaning |");
  push("|------|---------|");
  push("| **Course (golf course)** | Row in `public.courses` — layout + metadata (`course_name`, optional `club_name`, `api_id` / `canonical_api_id`, territory, trust fields). |");
  push("| **Club / venue** | Often `club_name` on the same row, or matched club name in UK Golf API **staging** tables — not a separate app entity. |");
  push("| **Imported API site** | External provider id (`api_id`, `canonical_api_id`, `source_provider_course_id`); UK pipeline also uses `uk_golf_api_*_candidates` before promotion to live. |");
  push("| **App route “course-data”** | Admin/review UI at `app/(app)/course-data/*` — not a database table. |");
  push("");

  push("## App code paths (where catalog is used today)");
  push("");
  push("| Area | Data source | Notes |");
  push("|------|-------------|-------|");
  push("| **Free Play** course search | `searchScorecardReadyCourses` → RPC `free_play_search_scorecard_ready_courses` (strict same-tee + no duplicate display names) | `app/(app)/free-play/index.tsx` |");
  push("| **Events** create flow | **Golf API** `searchCourses` / `getCourseById` → `importCourse` → `courses` | `app/(app)/(tabs)/events.tsx` |");
  push("| **Event manage** course | **Golf API** search + import | `app/(app)/event/[id]/manage.tsx` |");
  push("| **Weather** course pick | DB `searchCourses` + API `searchCourses` | `app/(app)/(tabs)/weather.tsx` |");
  push("| **CoursePicker** | DB `searchCourses` | `components/CoursePicker.tsx` |");
  push("| **Free Play round** resolve by name | `findBestPlayableCourseByName` (needs ≥1 active tee) | `app/(app)/free-play/[id].tsx` |");
  push("| **Course data admin** | `courseAdminRepo` (reviews, candidates, overrides) | `app/(app)/course-data/index.tsx`, tee editor |");
  push("");

  push("## Staging / pipeline tables (not the same as live search hits)");
  push("");
  const stagingCounts: [string, number | null][] = [
    ["uk_golf_api_course_candidates", await safeCount(supabase, "uk_golf_api_course_candidates")],
    ["uk_golf_api_tee_candidates", await safeCount(supabase, "uk_golf_api_tee_candidates")],
    ["uk_golf_api_hole_candidates", await safeCount(supabase, "uk_golf_api_hole_candidates")],
    ["course_import_candidates", await safeCount(supabase, "course_import_candidates")],
    ["course_import_batches", await safeCount(supabase, "course_import_batches")],
    ["course_import_staging", await safeCount(supabase, "course_import_staging")],
    ["event_courses", await safeCount(supabase, "event_courses")],
  ];
  for (const [name, c] of stagingCounts) {
    push(`- **${name}**: ${c == null ? "(table missing or no access)" : c}`);
  }
  push("");
  push("RLS: live `courses` / `course_tees` / `course_holes` are readable broadly to authenticated/anon for search (migration 049+); **UK Golf API staging** is **platform-admin SELECT** only (migration 145).");
  push("");

  console.log("Fetching live courses…");
  const courses = await fetchPaged<CourseRow>(
    supabase,
    "courses",
    "id, course_name, club_name, api_id, canonical_api_id, territory, golfer_data_status, validation_basis, data_confidence, enrichment_status, dedupe_key",
    500,
  );

  const teesAll = await fetchPaged<TeeRow>(
    supabase,
    "course_tees",
    "id, course_id, course_rating, slope_rating, par_total, is_active, is_default, display_order",
    1000,
  );

  const teesByCourse = new Map<string, TeeRow[]>();
  for (const t of teesAll) {
    const list = teesByCourse.get(t.course_id) ?? [];
    list.push(t);
    teesByCourse.set(t.course_id, list);
  }

  const activeTeeIds = teesAll.filter(isTeeActive).map((t) => t.id);
  const holesByTee = new Map<string, HoleRow[]>();
  const chunk = 80;
  for (let i = 0; i < activeTeeIds.length; i += chunk) {
    const slice = activeTeeIds.slice(i, i + chunk);
    if (slice.length === 0) break;
    const { data, error } = await supabase
      .from("course_holes")
      .select("tee_id, hole_number, par, stroke_index")
      .in("tee_id", slice);
    if (error) throw new Error(`course_holes: ${error.message}`);
    for (const row of (data ?? []) as HoleRow[]) {
      const list = holesByTee.get(row.tee_id) ?? [];
      list.push(row);
      holesByTee.set(row.tee_id, list);
    }
  }

  const nameKeyToIds = new Map<string, string[]>();
  for (const c of courses) {
    const nk = normalizeNameKey(displayName(c));
    const nkList = nameKeyToIds.get(nk) ?? [];
    nkList.push(c.id);
    nameKeyToIds.set(nk, nkList);
  }

  const apiKeyToIds = new Map<string, string[]>();
  for (const c of courses) {
    const apiKey = c.canonical_api_id != null ? String(c.canonical_api_id) : c.api_id != null ? String(c.api_id) : "";
    if (apiKey) {
      const list = apiKeyToIds.get(apiKey) ?? [];
      list.push(c.id);
      apiKeyToIds.set(apiKey, list);
    }
  }

  let verified = 0;
  let partial = 0;
  let unverified = 0;
  let rejected = 0;
  let otherStatus = 0;
  let withComplete18Si = 0;
  let withAnyActiveTee = 0;
  let withTeeRatingBlock = 0;
  let missingTees = 0;
  let missingSiAny = 0;

  type RowOut = {
    course: string;
    territory: string;
    apiId: string;
    status: string;
    tees: string;
    holes: string;
    si: string;
    search: string;
    issues: string;
    fpClass: FreePlayVisibilityClass;
  };

  const tableRows: RowOut[] = [];
  const strictReadyList: { id: string; name: string; territory: string; apiId: string }[] = [];
  const ratingsMissingSiList: { id: string; name: string }[] = [];
  const holesMissingRatingsList: { id: string; name: string }[] = [];
  const noTeesList: { id: string; name: string }[] = [];

  const classCounts: Record<FreePlayVisibilityClass, number> = {
    READY_FOR_FREE_PLAY: 0,
    NEEDS_TEE_DATA: 0,
    NEEDS_HOLE_DATA: 0,
    NEEDS_STROKE_INDEX: 0,
    NEEDS_RATING_SLOPE: 0,
    DUPLICATE_REVIEW: 0,
  };

  let strictScorecardReadyCount = 0;

  for (const c of courses) {
    const g = (c.golfer_data_status ?? "unverified").toLowerCase();
    if (g === "verified") verified += 1;
    else if (g === "partial") partial += 1;
    else if (g === "unverified") unverified += 1;
    else if (g === "rejected") rejected += 1;
    else otherStatus += 1;

    const disp = displayName(c);
    const tees = teesByCourse.get(c.id) ?? [];
    const activeTees = tees.filter(isTeeActive);
    const primary = pickPrimaryTee(tees);
    const holes = primary ? (holesByTee.get(primary.id) ?? []) : [];
    const ha = analyzeHoles(holes);

    if (activeTees.length > 0) withAnyActiveTee += 1;
    else missingTees += 1;

    const anyRating = activeTees.some(teeHasRatingBlock);
    if (anyRating) withTeeRatingBlock += 1;

    if (ha.siComplete) withComplete18Si += 1;
    if (ha.holeCount > 0 && ha.missingSi > 0) missingSiAny += 1;

    const apiKey = c.canonical_api_id != null ? String(c.canonical_api_id) : c.api_id != null ? String(c.api_id) : "";

    const strictReady = courseHasStrictReadyTee(activeTees, holesByTee);
    if (strictReady) {
      strictScorecardReadyCount += 1;
      strictReadyList.push({
        id: c.id,
        name: disp,
        territory: c.territory ?? "—",
        apiId: apiKey || "—",
      });
    }

    const nk = normalizeNameKey(disp);
    const isDup = (nameKeyToIds.get(nk)?.length ?? 0) > 1;

    const hasAnyHoleOnActive = activeTees.some((t) => (holesByTee.get(t.id) ?? []).length > 0);
    if (hasAnyHoleOnActive && !anyRating) {
      holesMissingRatingsList.push({ id: c.id, name: disp });
    }

    const hasRatedWith18Par = activeTees.some((t) => {
      if (!teeHasRatingBlock(t)) return false;
      return hasEighteenHolesWithPar(holesByTee.get(t.id) ?? []);
    });
    if (anyRating && !strictReady && hasRatedWith18Par) {
      ratingsMissingSiList.push({ id: c.id, name: disp });
    }

    if (activeTees.length === 0) {
      noTeesList.push({ id: c.id, name: disp });
    }

    const fpClass = classifyFreePlayVisibility({
      isDuplicateName: isDup,
      strictReady,
      activeTees,
      holesByTee,
    });
    classCounts[fpClass] += 1;

    const issues: string[] = [];
    if (activeTees.length === 0) issues.push("no active tees");
    if (!anyRating) issues.push("no tee with CR+Slope+Par");
    if (primary && ha.holeCount < 18) issues.push(`primary tee holes=${ha.holeCount}`);
    if (primary && ha.holeCount >= 18 && ha.missingSi > 0) issues.push(`SI gaps=${ha.missingSi}`);
    issues.push(`FP:${fpClass}`);

    tableRows.push({
      course: disp.slice(0, 42),
      territory: (c.territory ?? "—").slice(0, 12),
      apiId: apiKey || "—",
      status: (c.golfer_data_status ?? "—").slice(0, 12),
      tees: String(activeTees.length),
      holes: primary ? String(ha.holeCount) : "0",
      si: primary ? (ha.siComplete ? "Y" : `N(${ha.missingSi})`) : "—",
      search: "Y",
      issues: issues.join("; ") || "—",
      fpClass,
    });
  }

  const dupApi = [...apiKeyToIds.entries()].filter(([k, ids]) => k && ids.length > 1);
  const dupName = [...nameKeyToIds.entries()].filter(([, ids]) => ids.length > 1);

  push("## Key outputs (grep-friendly)");
  push("");
  push("Parity SQL (same rules, run in SQL editor): `scripts/sql/audit_strict_scorecard_ready.sql`.");
  push("");
  push("| Output | Value |");
  push("|--------|------:|");
  push(`| strict_scorecard_ready_count | **${strictScorecardReadyCount}** |`);
  push(`| courses_ratings_but_missing_si | **${ratingsMissingSiList.length}** |`);
  push(`| courses_holes_but_missing_ratings | **${holesMissingRatingsList.length}** |`);
  push(`| courses_no_active_tees | **${noTeesList.length}** |`);
  push(`| duplicate_display_name_groups | **${dupName.length}** |`);
  push(`| fp_ready_for_free_play | **${classCounts.READY_FOR_FREE_PLAY}** |`);
  push(`| fp_duplicate_review | **${classCounts.DUPLICATE_REVIEW}** |`);
  push(`| fp_needs_tee_data | **${classCounts.NEEDS_TEE_DATA}** |`);
  push(`| fp_needs_rating_slope | **${classCounts.NEEDS_RATING_SLOPE}** |`);
  push(`| fp_needs_hole_data | **${classCounts.NEEDS_HOLE_DATA}** |`);
  push(`| fp_needs_stroke_index | **${classCounts.NEEDS_STROKE_INDEX}** |`);
  push("");

  push("## Strict scorecard-ready (same active tee)");
  push("");
  push(
    "A course counts as **strict scorecard-ready** only if **at least one active tee** on that course has, **on the same tee row**:",
  );
  push("");
  push("- `course_rating`, `slope_rating`, `par_total` all present and &gt; 0");
  push("- Holes **1–18** each present on `course_holes` for that `tee_id`");
  push("- Each hole **par** &gt; 0");
  push("- Each **stroke_index** an integer **1–18**");
  push("- **No duplicate** stroke indexes across holes 1–18");
  push("");
  push(`| **strict_scorecard_ready_count** | **${strictScorecardReadyCount}** |`);
  push("");
  if (strictReadyList.length > 0) {
    push("### Strict scorecard-ready courses (id · name · territory · API id)");
    push("");
    for (const r of strictReadyList.sort((a, b) => a.name.localeCompare(b.name))) {
      push(`- \`${r.id}\` · ${r.name.replace(/\|/g, "/")} · ${r.territory} · ${r.apiId}`);
    }
    push("");
  }

  push("## Derived issue lists (for remediation)");
  push("");
  push(`| **Courses with ratings but missing SI** (rated tee + holes 1–18 all par, but not strict SI / uniqueness) | **${ratingsMissingSiList.length}** |`);
  push(`| **Courses with holes on an active tee but no rated active tee** | **${holesMissingRatingsList.length}** |`);
  push(`| **Courses with no active tees** | **${noTeesList.length}** |`);
  push("");
  push(`<details><summary>Full list: courses with ratings but missing SI (${ratingsMissingSiList.length})</summary>`);
  push("");
  for (const r of ratingsMissingSiList.sort((a, b) => a.name.localeCompare(b.name))) {
    push(`- \`${r.id}\` · ${r.name.replace(/\|/g, "/")}`);
  }
  push("");
  push("</details>");
  push("");
  push(`<details><summary>Full list: courses with holes on active tee but no rated active tee (${holesMissingRatingsList.length})</summary>`);
  push("");
  for (const r of holesMissingRatingsList.sort((a, b) => a.name.localeCompare(b.name))) {
    push(`- \`${r.id}\` · ${r.name.replace(/\|/g, "/")}`);
  }
  push("");
  push("</details>");
  push("");
  push(`<details><summary>Full list: courses with no active tees (${noTeesList.length})</summary>`);
  push("");
  for (const r of noTeesList.sort((a, b) => a.name.localeCompare(b.name))) {
    push(`- \`${r.id}\` · ${r.name.replace(/\|/g, "/")}`);
  }
  push("");
  push("</details>");
  push("");

  push("## Duplicate display-name groups");
  push("");
  push(`| Duplicate name keys (≥2 course ids) | **${dupName.length}** |`);
  push("");
  const dupNameSorted = [...dupName].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  for (const [k, ids] of dupNameSorted) {
    push(`- **${k}** → ${ids.length} ids: ${ids.join(", ")}`);
  }
  push("");

  push("## Free Play Visibility Recommendation");
  push("");
  push("**Audit-only classification** (each course gets one bucket). **Duplicate** name collisions take precedence over readiness.");
  push("");
  push("| Class | Count | Meaning |");
  push("|-------|------:|---------|");
  push(`| READY_FOR_FREE_PLAY | ${classCounts.READY_FOR_FREE_PLAY} | Passes strict same-tee scorecard rules; not a duplicate display name. |`);
  push(`| DUPLICATE_REVIEW | ${classCounts.DUPLICATE_REVIEW} | Same normalized name as another course — resolve before promoting in search. |`);
  push(`| NEEDS_TEE_DATA | ${classCounts.NEEDS_TEE_DATA} | No active \`course_tees\` rows. |`);
  push(`| NEEDS_RATING_SLOPE | ${classCounts.NEEDS_RATING_SLOPE} | Active tees exist but none have CR+Slope+Par. |`);
  push(`| NEEDS_HOLE_DATA | ${classCounts.NEEDS_HOLE_DATA} | Rated tee exists but no rated tee has holes 1–18 with par. |`);
  push(`| NEEDS_STROKE_INDEX | ${classCounts.NEEDS_STROKE_INDEX} | Rated + 18 pars on some tee, but stroke index set invalid / duplicated / missing. |`);
  push("");
  push("### Recommended product behaviour (future code change — not applied in this audit)");
  push("");
  push(
    "- **Default Free Play search** should list only **`READY_FOR_FREE_PLAY`** (strict same-tee definition above), optionally union **society-approved** overrides if you keep that trust tier.",
  );
  push(
    "- **All other classes** should be **hidden from default Free Play picker** or shown only under **Advanced / Admin / Import** with an explicit **“not scorecard-ready”** warning.",
  );
  push(
    "- **`DUPLICATE_REVIEW`** rows should never rank alongside canonical picks until merged or renamed — even if one row is strict-ready.",
  );
  push(
    "- Today’s **`searchVerifiedCourses`** widens to **`searchCourses`** when almost nothing is `verified`; that surfaces **NEEDS_*** courses. Tightening to strict-ready (or `verified` + strict-ready) is the safest default.",
  );
  push("");

  push("## Summary counts (live `courses` table)");
  push("");
  push(`| Metric | Count |`);
  push(`|--------|-------|`);
  push(`| Total courses | ${courses.length} |`);
  push(`| golfer_data_status = verified | ${verified} |`);
  push(`| golfer_data_status = partial | ${partial} |`);
  push(`| golfer_data_status = unverified | ${unverified} |`);
  push(`| golfer_data_status = rejected | ${rejected} |`);
  push(`| Other / unknown status | ${otherStatus} |`);
  push(`| With ≥1 active tee | ${withAnyActiveTee} |`);
  push(`| With no active tee | ${missingTees} |`);
  push(`| With ≥1 active tee having CR+Slope+Par | ${withTeeRatingBlock} |`);
  push(`| Primary active tee: 18 holes + all SI (legacy metric) | ${withComplete18Si} |`);
  push(`| Primary tee has holes but incomplete SI | ${missingSiAny} |`);
  push(`| **Strict same-tee scorecard-ready** | **${strictScorecardReadyCount}** |`);
  push(`| Duplicate api_id/canonical key (≥2 rows) | ${dupApi.length} keys |`);
  push(`| Duplicate display name (≥2 rows) | ${dupName.length} keys |`);
  push("");
  push("## Search visibility (today)");
  push("");
  push("Live **`courses`** rows: app search uses PostgREST `SELECT` with policy **`courses_select_all`** (`USING (true)` for anon + authenticated) — **every course row is visible** in DB-backed search (`searchCourses` / `searchVerifiedCourses`).");
  push("");
  push("**Not in user search:** `uk_golf_api_*_candidates` (admin-only RLS), `course_import_candidates` / `course_import_batches` (operator tooling), `course_import_staging` (import audit).");
  push("");

  if (dupApi.length > 0) {
    push("### Sample duplicate API id groups (first 15)");
    push("");
    for (const [k, ids] of dupApi.slice(0, 15)) {
      push(`- api/canonical **${k}** → ${ids.length} rows: ${ids.slice(0, 4).join(", ")}${ids.length > 4 ? "…" : ""}`);
    }
    push("");
  }

  push(`## Course table (first ${limit} rows, alphabetical)`);
  push("");
  const header =
    "| Course | Territory | API ID | Verified | Tees | Holes | SI | FP Class | Issues |";
  const sep = "|--------|------------|--------|----------|------|-------|----|----------|--------|";
  push(header);
  push(sep);

  const sorted = [...tableRows].sort((a, b) => a.course.localeCompare(b.course));
  for (const r of sorted.slice(0, limit)) {
    push(
      `| ${r.course.replace(/\|/g, "/")} | ${r.territory} | ${r.apiId} | ${r.status} | ${r.tees} | ${r.holes} | ${r.si} | ${r.fpClass} | ${r.issues.replace(/\|/g, "/")} |`,
    );
  }
  push("");

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, lines.join("\n"), "utf8");
    console.log(`\nWrote ${abs}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
