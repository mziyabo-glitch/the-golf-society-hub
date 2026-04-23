import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config();

type TeeName = "White" | "Yellow" | "Red";
type Hole = { hole_number: number; par: number; stroke_index: number; yardage: number };
type TeeSeed = { name: TeeName; holes: Hole[] };
type CourseSeed = { course_name: string; club_name: string; tees: TeeSeed[] };

const SOURCE_TYPE = "manual_seed";

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

const COURSES: CourseSeed[] = [
  {
    course_name: "Vale Resort – Lake Course",
    club_name: "Vale Resort",
    tees: [
      {
        name: "White",
        holes: makeHoles([
          [1, 199, 3, 9],
          [2, 491, 5, 13],
          [3, 157, 3, 17],
          [4, 440, 4, 1],
          [5, 403, 4, 3],
          [6, 483, 5, 15],
          [7, 510, 5, 11],
          [8, 210, 3, 5],
          [9, 387, 4, 7],
          [10, 127, 3, 18],
          [11, 341, 4, 12],
          [12, 315, 4, 6],
          [13, 137, 3, 16],
          [14, 608, 5, 4],
          [15, 275, 4, 14],
          [16, 457, 4, 2],
          [17, 275, 4, 10],
          [18, 489, 5, 8],
        ]),
      },
      {
        name: "Yellow",
        holes: makeHoles([
          [1, 180, 3, 9],
          [2, 445, 5, 13],
          [3, 144, 3, 17],
          [4, 435, 4, 1],
          [5, 362, 4, 3],
          [6, 463, 5, 15],
          [7, 510, 5, 11],
          [8, 207, 3, 5],
          [9, 382, 4, 7],
          [10, 125, 3, 18],
          [11, 335, 4, 12],
          [12, 308, 4, 6],
          [13, 130, 3, 16],
          [14, 558, 5, 4],
          [15, 270, 4, 14],
          [16, 418, 4, 2],
          [17, 271, 4, 10],
          [18, 443, 5, 8],
        ]),
      },
      {
        name: "Red",
        holes: makeHoles([
          [1, 160, 3, 15],
          [2, 430, 5, 13],
          [3, 131, 3, 17],
          [4, 430, 5, 9],
          [5, 357, 4, 3],
          [6, 449, 5, 5],
          [7, 475, 5, 7],
          [8, 196, 3, 11],
          [9, 370, 4, 1],
          [10, 122, 3, 18],
          [11, 328, 4, 8],
          [12, 295, 4, 2],
          [13, 129, 3, 16],
          [14, 507, 5, 4],
          [15, 264, 4, 14],
          [16, 404, 5, 10],
          [17, 262, 4, 12],
          [18, 436, 5, 6],
        ]),
      },
    ],
  },
  {
    course_name: "Vale Resort – Wales National Course",
    club_name: "Vale Resort",
    tees: [
      {
        name: "White",
        holes: makeHoles([
          [1, 456, 4, 3],
          [2, 571, 5, 1],
          [3, 219, 3, 17],
          [4, 534, 5, 5],
          [5, 394, 4, 13],
          [6, 284, 4, 15],
          [7, 466, 5, 9],
          [8, 177, 3, 7],
          [9, 453, 4, 11],
          [10, 538, 5, 6],
          [11, 335, 4, 16],
          [12, 168, 3, 18],
          [13, 441, 4, 2],
          [14, 155, 3, 12],
          [15, 477, 5, 14],
          [16, 484, 4, 8],
          [17, 466, 4, 4],
          [18, 369, 4, 10],
        ]),
      },
      {
        name: "Yellow",
        holes: makeHoles([
          [1, 414, 4, 3],
          [2, 566, 5, 1],
          [3, 175, 3, 17],
          [4, 527, 5, 5],
          [5, 386, 4, 13],
          [6, 260, 4, 15],
          [7, 455, 5, 9],
          [8, 168, 3, 7],
          [9, 437, 4, 11],
          [10, 519, 5, 6],
          [11, 318, 4, 16],
          [12, 152, 3, 18],
          [13, 419, 4, 2],
          [14, 131, 3, 12],
          [15, 455, 5, 14],
          [16, 434, 4, 8],
          [17, 449, 4, 4],
          [18, 352, 4, 10],
        ]),
      },
      {
        name: "Red",
        holes: makeHoles([
          [1, 404, 4, 5],
          [2, 545, 5, 1],
          [3, 144, 3, 9],
          [4, 436, 5, 3],
          [5, 355, 4, 7],
          [6, 236, 4, 17],
          [7, 383, 5, 13],
          [8, 118, 3, 11],
          [9, 313, 4, 15],
          [10, 440, 5, 4],
          [11, 305, 4, 6],
          [12, 139, 3, 18],
          [13, 374, 4, 2],
          [14, 103, 3, 14],
          [15, 440, 5, 12],
          [16, 407, 5, 16],
          [17, 415, 5, 8],
          [18, 306, 4, 10],
        ]),
      },
    ],
  },
];

function validateSeedCourse(course: CourseSeed): void {
  if (course.tees.length !== 3) throw new Error(`${course.course_name}: expected 3 tees`);
  for (const tee of course.tees) {
    if (tee.holes.length !== 18) throw new Error(`${course.course_name} ${tee.name}: expected 18 holes`);
    const numbers = new Set(tee.holes.map((h) => h.hole_number));
    const sis = new Set(tee.holes.map((h) => h.stroke_index));
    for (let i = 1; i <= 18; i += 1) {
      if (!numbers.has(i)) throw new Error(`${course.course_name} ${tee.name}: missing hole ${i}`);
      if (!sis.has(i)) throw new Error(`${course.course_name} ${tee.name}: missing stroke index ${i}`);
    }
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
    full_name: seed.course_name,
    club_name: seed.club_name,
    normalized_name: normalizeName(seed.course_name),
    source: SOURCE_TYPE,
    source_type: SOURCE_TYPE,
    source_url: null,
    sync_status: "ok",
    confidence_score: 100,
    enrichment_status: "imported",
    raw_row: {
      source: SOURCE_TYPE,
      seed_name: seed.course_name,
      seeded_via: "scripts/seed-vale-resort.ts",
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
  console.log(`[vale-seed] course ok: ${seed.course_name} (course_id=${courseId})`);

  const teeIdByName = new Map<TeeName, string>();

  for (const tee of seed.tees) {
    const totalPar = tee.holes.reduce((sum, h) => sum + h.par, 0);
    const totalYards = tee.holes.reduce((sum, h) => sum + h.yardage, 0);

    const teePayload = {
      course_id: courseId,
      tee_name: tee.name,
      par_total: totalPar,
      yards: totalYards,
      is_active: true,
      source_type: SOURCE_TYPE,
      sync_status: "ok",
      confidence_score: 100,
    };

    if (dryRun) {
      console.log(`[vale-seed] dry-run tee: ${seed.course_name} / ${tee.name} (par=${totalPar}, yards=${totalYards})`);
      teeIdByName.set(tee.name, `dry-${tee.name.toLowerCase()}`);
      continue;
    }

    const { data: teeRow, error: teeErr } = await supabase
      .from("course_tees")
      .upsert(teePayload, { onConflict: "course_id,tee_name" })
      .select("id")
      .single();
    if (teeErr || !teeRow) throw new Error(`Tee upsert failed (${seed.course_name} / ${tee.name}): ${teeErr?.message ?? "unknown"}`);
    teeIdByName.set(tee.name, String((teeRow as { id: string }).id));
    console.log(`[vale-seed] tee ok: ${seed.course_name} / ${tee.name}`);
  }

  if (dryRun) {
    console.log(`[vale-seed] dry-run holes: ${seed.course_name} (would replace with ${seed.tees.length * 18} rows)`);
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
  console.log(`[vale-seed] holes ok: ${seed.course_name} (${holeRows.length} rows)`);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));

  for (const course of COURSES) {
    await seedCourse(supabase, course, dryRun);
  }
  console.log(`[vale-seed] complete${dryRun ? " (dry-run)" : ""}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[vale-seed] fatal:", message);
  process.exit(1);
});
