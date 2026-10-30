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
  gender?: "male" | "female";
  holes: Hole[];
};
type CourseSeed = {
  course_name: string;
  club_name: string;
  country: string;
  territory: string;
  source_url: string;
  tees: TeeSeed[];
};

const SOURCE_TYPE = "golfpass_scorecard";
const SOURCE_LABEL = "golfpass_scorecard";

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

/** GolfPass lists Bulawayo Country Club yardages in metres; convert to yards for storage. */
function metersToYards(meters: number): number {
  return Math.round(meters * 1.09361);
}

function makeHolesFromMeters(rows: Array<[number, number, number, number]>): Hole[] {
  return rows.map(([hole_number, meters, par, stroke_index]) => ({
    hole_number,
    yardage: metersToYards(meters),
    par,
    stroke_index,
  }));
}

const BGC_PAR = [4, 4, 3, 5, 5, 4, 3, 4, 4, 4, 3, 4, 4, 5, 3, 4, 4, 5] as const;
const BGC_SI = [17, 3, 9, 15, 7, 5, 13, 1, 11, 10, 18, 2, 4, 16, 8, 14, 6, 12] as const;

function bgcHoles(yardages: number[]): Hole[] {
  return yardages.map((yardage, i) => ({
    hole_number: i + 1,
    yardage,
    par: BGC_PAR[i],
    stroke_index: BGC_SI[i],
  }));
}

const BULAWAYO_GOLF_CLUB: CourseSeed = {
  course_name: "Bulawayo Golf Club",
  club_name: "Bulawayo Golf Club",
  country: "Zimbabwe",
  territory: "zimbabwe",
  source_url: "https://www.golfpass.com/travel-advisor/courses/31812-bulawayo-golf-club",
  tees: [
    {
      name: "White",
      color: "white",
      course_rating: 71.9,
      slope_rating: 130,
      par_total: 72,
      yards: 6908,
      gender: "male",
      holes: bgcHoles([
        300, 404, 164, 511, 554, 442, 171, 474, 446, 364, 143, 448, 430, 545, 209, 378, 428, 497,
      ]),
    },
    {
      name: "Blue",
      color: "blue",
      course_rating: 68.7,
      slope_rating: 120,
      par_total: 72,
      yards: 6197,
      gender: "male",
      holes: bgcHoles([
        284, 342, 117, 476, 507, 392, 162, 414, 385, 348, 135, 405, 378, 486, 191, 339, 377, 459,
      ]),
    },
    {
      name: "Red",
      color: "red",
      course_rating: 66.1,
      slope_rating: 109,
      par_total: 72,
      yards: 5696,
      gender: "male",
      holes: bgcHoles([
        266, 312, 115, 427, 477, 348, 133, 386, 361, 331, 122, 375, 349, 455, 174, 315, 342, 408,
      ]),
    },
  ],
};

const BULAWAYO_COUNTRY_CLUB: CourseSeed = {
  course_name: "Bulawayo Country Club",
  club_name: "Bulawayo Country Club",
  country: "Zimbabwe",
  territory: "zimbabwe",
  source_url: "https://www.golfpass.com/travel-advisor/courses/31811-bulawayo-country-club",
  tees: [
    {
      name: "White",
      color: "white",
      course_rating: 70.7,
      slope_rating: 121,
      par_total: 72,
      yards: 0,
      gender: "male",
      holes: makeHolesFromMeters([
        [1, 381, 4, 8],
        [2, 373, 4, 10],
        [3, 188, 3, 12],
        [4, 342, 4, 14],
        [5, 386, 4, 2],
        [6, 523, 5, 4],
        [7, 157, 3, 18],
        [8, 366, 4, 6],
        [9, 481, 5, 16],
        [10, 186, 3, 15],
        [11, 532, 5, 9],
        [12, 344, 4, 11],
        [13, 425, 4, 1],
        [14, 348, 4, 5],
        [15, 371, 4, 13],
        [16, 132, 3, 17],
        [17, 520, 5, 7],
        [18, 392, 4, 3],
      ]),
    },
    {
      name: "Red",
      color: "red",
      course_rating: 70.2,
      slope_rating: 119,
      par_total: 72,
      yards: 0,
      gender: "female",
      holes: makeHolesFromMeters([
        [1, 332, 4, 11],
        [2, 344, 4, 1],
        [3, 130, 3, 17],
        [4, 325, 4, 7],
        [5, 335, 4, 3],
        [6, 436, 5, 5],
        [7, 141, 3, 15],
        [8, 293, 4, 9],
        [9, 412, 5, 13],
        [10, 121, 3, 16],
        [11, 442, 5, 4],
        [12, 307, 4, 10],
        [13, 374, 4, 8],
        [14, 296, 4, 12],
        [15, 364, 4, 6],
        [16, 99, 3, 18],
        [17, 425, 5, 14],
        [18, 337, 4, 2],
      ]),
    },
  ],
};

// Derive total yards from hole rows (Country Club tees).
for (const tee of BULAWAYO_COUNTRY_CLUB.tees) {
  tee.yards = tee.holes.reduce((sum, h) => sum + h.yardage, 0);
}

const COURSES: CourseSeed[] = [BULAWAYO_GOLF_CLUB, BULAWAYO_COUNTRY_CLUB];

function validateSeedCourse(course: CourseSeed): void {
  if (course.tees.length < 1) throw new Error(`${course.course_name}: expected at least one tee`);
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
    if (parTotal !== tee.par_total) {
      throw new Error(`${course.course_name} ${tee.name}: par total mismatch (${parTotal} != ${tee.par_total})`);
    }
    if (yardTotal !== tee.yards) {
      throw new Error(`${course.course_name} ${tee.name}: yard total mismatch (${yardTotal} != ${tee.yards})`);
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
    country: seed.country,
    source_country_code: "zw",
    source: SOURCE_LABEL,
    source_type: SOURCE_TYPE,
    source_url: seed.source_url,
    sync_status: "ok",
    confidence_score: 100,
    enrichment_status: "imported",
    golfer_data_status: "verified",
    validation_basis: "official_only",
    data_confidence: "high",
    raw_row: {
      source: SOURCE_LABEL,
      seed_name: seed.course_name,
      seeded_via: "scripts/seed-bulawayo-courses.ts",
      notes: "GolfPass published scorecard (yards for BGC; metres converted to yards for BCC).",
    },
    seeded_status: "seeded",
    discovery_status: "resolved",
    territory: seed.territory,
    seed_phase: null,
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
  console.log(`[bulawayo-seed] course ok: ${seed.course_name} (course_id=${courseId})`);

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
      gender: tee.gender ?? null,
      is_active: true,
      source_type: SOURCE_TYPE,
      sync_status: "ok",
      confidence_score: 100,
    };

    if (dryRun) {
      console.log(
        `[bulawayo-seed] dry-run tee: ${seed.course_name} / ${tee.name} (CR=${tee.course_rating}, S=${tee.slope_rating}, yards=${tee.yards})`,
      );
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
        `[bulawayo-seed] deactivated ${staleTeeIds.length} stale tees for ${seed.course_name}: ${staleTeeIds.join(", ")}`,
      );
    }
  }

  if (dryRun) {
    console.log(`[bulawayo-seed] dry-run holes: ${seed.course_name} (would replace with ${seed.tees.length * 18} rows)`);
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
  console.log(`[bulawayo-seed] holes ok: ${seed.course_name} (${holeRows.length} rows)`);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  for (const course of COURSES) {
    await seedCourse(supabase, course, dryRun);
  }
  console.log(`[bulawayo-seed] complete${dryRun ? " (dry-run)" : ""}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[bulawayo-seed] fatal:", message);
  process.exit(1);
});
