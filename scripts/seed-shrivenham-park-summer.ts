import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type Hole = { hole_number: number; par: number; stroke_index: number; yardage: number };
type TeeSeed = {
  name: string;
  color: string;
  course_rating: number;
  slope_rating: number;
  par_total: number;
  yards: number;
  holes: Hole[];
};
type CourseSeed = { course_name: string; club_name: string; tees: TeeSeed[] };

const SOURCE_TYPE = "official_club_scorecard";
const SOURCE_LABEL = "official_club_scorecard";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeName(input: string): string {
  return input.toLowerCase().replace(/[–—]/g, "-").replace(/[^a-z0-9]+/g, " ").trim();
}

function makeHoles(rows: Array<[number, number, number, number]>): Hole[] {
  return rows.map(([hole_number, yardage, par, stroke_index]) => ({ hole_number, yardage, par, stroke_index }));
}

const SHRIVENHAM_SUMMER: CourseSeed = {
  course_name: "Shrivenham Park GC Summer",
  club_name: "Shrivenham Park Golf Club",
  tees: [
    {
      name: "Yellow",
      color: "yellow",
      course_rating: 67.7,
      slope_rating: 121,
      par_total: 69,
      yards: 5467,
      holes: makeHoles([
        [1, 318, 4, 17], [2, 166, 3, 11], [3, 372, 4, 9], [4, 257, 4, 15], [5, 481, 5, 3], [6, 275, 4, 5],
        [7, 295, 4, 7], [8, 413, 4, 1], [9, 202, 3, 13], [10, 153, 3, 18], [11, 187, 3, 12], [12, 323, 4, 10],
        [13, 504, 5, 2], [14, 312, 4, 8], [15, 155, 3, 16], [16, 373, 4, 4], [17, 500, 5, 6], [18, 181, 3, 14],
      ]),
    },
    {
      name: "Purple",
      color: "purple",
      course_rating: 65.3,
      slope_rating: 114,
      par_total: 69,
      yards: 5038,
      holes: makeHoles([
        [1, 278, 4, 17], [2, 136, 3, 11], [3, 343, 4, 9], [4, 228, 4, 15], [5, 460, 5, 3], [6, 275, 4, 5],
        [7, 283, 4, 7], [8, 392, 4, 1], [9, 191, 3, 13], [10, 147, 3, 18], [11, 176, 3, 12], [12, 303, 4, 10],
        [13, 471, 5, 2], [14, 270, 4, 8], [15, 132, 3, 16], [16, 331, 4, 4], [17, 473, 5, 6], [18, 149, 3, 14],
      ]),
    },
    {
      name: "Green",
      color: "green",
      course_rating: 68.4,
      slope_rating: 118,
      par_total: 69,
      yards: 4820,
      holes: makeHoles([
        [1, 269, 4, 17], [2, 152, 3, 13], [3, 318, 4, 9], [4, 221, 4, 15], [5, 409, 5, 3], [6, 275, 4, 5],
        [7, 249, 4, 7], [8, 367, 4, 1], [9, 182, 3, 11], [10, 141, 3, 16], [11, 152, 3, 12], [12, 287, 4, 10],
        [13, 433, 5, 2], [14, 268, 4, 8], [15, 117, 3, 18], [16, 318, 4, 6], [17, 491, 5, 4], [18, 171, 3, 14],
      ]),
    },
    {
      name: "Blue",
      color: "blue",
      course_rating: 63.1,
      slope_rating: 106,
      par_total: 68,
      yards: 4581,
      holes: makeHoles([
        [1, 257, 4, 17], [2, 107, 3, 11], [3, 330, 4, 9], [4, 209, 4, 15], [5, 428, 5, 3], [6, 275, 4, 5],
        [7, 131, 3, 7], [8, 384, 4, 1], [9, 168, 3, 13], [10, 144, 3, 18], [11, 159, 3, 12], [12, 276, 4, 10],
        [13, 428, 5, 2], [14, 243, 4, 8], [15, 114, 3, 16], [16, 311, 4, 4], [17, 456, 5, 6], [18, 161, 3, 14],
      ]),
    },
    {
      name: "Blue Alternate",
      color: "blue",
      course_rating: 67.5,
      slope_rating: 113,
      par_total: 68,
      yards: 4581,
      holes: makeHoles([
        [1, 257, 4, 17], [2, 107, 3, 11], [3, 330, 4, 9], [4, 209, 4, 15], [5, 428, 5, 3], [6, 275, 4, 5],
        [7, 131, 3, 7], [8, 384, 4, 1], [9, 168, 3, 13], [10, 144, 3, 18], [11, 159, 3, 12], [12, 276, 4, 10],
        [13, 428, 5, 2], [14, 243, 4, 8], [15, 114, 3, 16], [16, 311, 4, 4], [17, 456, 5, 6], [18, 161, 3, 14],
      ]),
    },
  ],
};

function validateSeedCourse(course: CourseSeed): void {
  if (course.tees.length !== 5) throw new Error(`${course.course_name}: expected 5 tees`);
  for (const tee of course.tees) {
    if (tee.holes.length !== 18) throw new Error(`${course.course_name} ${tee.name}: expected 18 holes`);
    const numbers = new Set(tee.holes.map((h) => h.hole_number));
    const sis = new Set(tee.holes.map((h) => h.stroke_index));
    for (let i = 1; i <= 18; i += 1) {
      if (!numbers.has(i)) throw new Error(`${course.course_name} ${tee.name}: missing hole ${i}`);
      if (!sis.has(i)) throw new Error(`${course.course_name} ${tee.name}: missing stroke index ${i}`);
    }
    const parTotal = tee.holes.reduce((sum, h) => sum + h.par, 0);
    const yardTotal = tee.holes.reduce((sum, h) => sum + h.yardage, 0);
    if (parTotal !== tee.par_total) throw new Error(`${course.course_name} ${tee.name}: par total mismatch (${parTotal} != ${tee.par_total})`);
    if (yardTotal !== tee.yards) throw new Error(`${course.course_name} ${tee.name}: yard total mismatch (${yardTotal} != ${tee.yards})`);
  }
}

async function upsertCourseByName(supabase: SupabaseClient, seed: CourseSeed, dryRun: boolean): Promise<string> {
  const nameVariants = [...new Set([seed.course_name, seed.course_name.replace(/[–—]/g, "-"), seed.course_name.replace(/-/g, "–")])];
  const { data: existingByName, error: lookupErr } = await supabase
    .from("courses")
    .select("id")
    .in("course_name", nameVariants)
    .limit(1);
  if (lookupErr) throw new Error(`Course lookup failed for ${seed.course_name}: ${lookupErr.message}`);

  if (dryRun) {
    if (existingByName && existingByName.length > 0) return String((existingByName[0] as { id: string }).id);
    return `dry-${normalizeKey(seed.course_name)}`;
  }

  const payload = {
    dedupe_key: `manual_seed:${normalizeKey(seed.course_name)}`,
    course_name: seed.course_name,
    full_name: `${seed.club_name} - Summer Course`,
    club_name: seed.club_name,
    normalized_name: normalizeName(seed.course_name),
    source: SOURCE_LABEL,
    source_type: SOURCE_TYPE,
    source_url: null,
    sync_status: "ok",
    confidence_score: 100,
    enrichment_status: "imported",
    golfer_data_status: "verified",
    validation_basis: "official_only",
    data_confidence: "high",
    raw_row: {
      source: SOURCE_LABEL,
      seed_name: seed.course_name,
      seeded_via: "scripts/seed-shrivenham-park-summer.ts",
      notes: "Official Shrivenham Park GC Summer scorecard screenshot/manual entry.",
    },
    seeded_status: "seeded",
    discovery_status: "resolved",
    territory: "uk",
    seed_phase: "england_wales",
  };

  if (existingByName && existingByName.length > 0) {
    const courseId = String((existingByName[0] as { id: string }).id);
    const { error: updateErr } = await supabase.from("courses").update(payload).eq("id", courseId);
    if (updateErr) throw new Error(`Course update failed for ${seed.course_name}: ${updateErr.message}`);
    return courseId;
  }

  const { data: inserted, error: upsertErr } = await supabase
    .from("courses")
    .upsert(payload, { onConflict: "dedupe_key" })
    .select("id")
    .single();
  if (upsertErr || !inserted) throw new Error(`Course upsert failed for ${seed.course_name}: ${upsertErr?.message ?? "unknown"}`);
  return String((inserted as { id: string }).id);
}

async function seedCourse(supabase: SupabaseClient, seed: CourseSeed, dryRun: boolean): Promise<void> {
  validateSeedCourse(seed);
  const courseId = await upsertCourseByName(supabase, seed, dryRun);
  console.log(`[shrivenham-seed] course ok: ${seed.course_name} (course_id=${courseId})`);

  const teeIdByName = new Map<string, string>();
  const seededTeeNames = new Set(seed.tees.map((t) => t.name));
  for (const tee of seed.tees) {
    const teePayload = {
      course_id: courseId,
      tee_name: tee.name,
      tee_color: tee.color,
      course_rating: tee.course_rating,
      slope_rating: tee.slope_rating,
      par_total: tee.par_total,
      yards: tee.yards,
      is_active: true,
      source_type: SOURCE_TYPE,
      sync_status: "ok",
      confidence_score: 100,
    };

    if (dryRun) {
      console.log(`[shrivenham-seed] dry-run tee: ${seed.course_name} / ${tee.name} (CR=${tee.course_rating}, S=${tee.slope_rating})`);
      teeIdByName.set(tee.name, `dry-${normalizeKey(tee.name)}`);
      continue;
    }

    const { data: teeRow, error: teeErr } = await supabase
      .from("course_tees")
      .upsert(teePayload, { onConflict: "course_id,tee_name" })
      .select("id")
      .single();
    if (teeErr || !teeRow) throw new Error(`Tee upsert failed (${seed.course_name} / ${tee.name}): ${teeErr?.message ?? "unknown"}`);
    teeIdByName.set(tee.name, String((teeRow as { id: string }).id));
  }

  if (!dryRun) {
    const { data: existingTees, error: existingTeesErr } = await supabase
      .from("course_tees")
      .select("id, tee_name, is_active")
      .eq("course_id", courseId);
    if (existingTeesErr) {
      throw new Error(`Tee list read failed (${seed.course_name}): ${existingTeesErr.message}`);
    }

    const staleTeeIds = (existingTees ?? [])
      .filter((row) => !seededTeeNames.has(String((row as { tee_name?: unknown }).tee_name ?? "")))
      .map((row) => String((row as { id: string }).id));

    if (staleTeeIds.length > 0) {
      const { error: deactivateErr } = await supabase
        .from("course_tees")
        .update({ is_active: false })
        .eq("course_id", courseId)
        .in("id", staleTeeIds);
      if (deactivateErr) {
        throw new Error(`Stale tee deactivation failed (${seed.course_name}): ${deactivateErr.message}`);
      }
      console.log(
        `[shrivenham-seed] deactivated ${staleTeeIds.length} stale tees for ${seed.course_name}: ${staleTeeIds.join(", ")}`,
      );
    }
  }

  if (dryRun) {
    console.log(`[shrivenham-seed] dry-run holes: ${seed.course_name} (would replace with ${seed.tees.length * 18} rows)`);
    return;
  }

  const { error: deleteErr } = await supabase.from("course_holes").delete().eq("course_id", courseId);
  if (deleteErr) throw new Error(`Hole delete failed for ${seed.course_name}: ${deleteErr.message}`);

  const holeRows = seed.tees.flatMap((tee) =>
    tee.holes.map((h) => ({
      course_id: courseId,
      tee_id: teeIdByName.get(tee.name),
      hole_number: h.hole_number,
      par: h.par,
      stroke_index: h.stroke_index,
      yardage: h.yardage,
      source_type: SOURCE_TYPE,
      sync_status: "ok",
      confidence_score: 100,
    })),
  );
  const { error: holeErr } = await supabase.from("course_holes").insert(holeRows);
  if (holeErr) throw new Error(`Hole insert failed for ${seed.course_name}: ${holeErr.message}`);
  console.log(`[shrivenham-seed] holes ok: ${seed.course_name} (${holeRows.length} rows)`);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  await seedCourse(supabase, SHRIVENHAM_SUMMER, dryRun);
  console.log(`[shrivenham-seed] complete${dryRun ? " (dry-run)" : ""}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[shrivenham-seed] fatal:", message);
  process.exit(1);
});
