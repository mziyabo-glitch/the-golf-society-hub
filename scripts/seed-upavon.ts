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
const SOURCE_URL =
  "https://www.upavongolfclub.co.uk/uploads/upavon/File/Upavon%20Scorecard%20June%202026.pdf";

/** Par and stroke index are identical on all tees (June 2026 official scorecard). */
const UPAVON_PAR = [4, 4, 4, 4, 5, 3, 5, 3, 4, 4, 4, 3, 5, 3, 5, 4, 4, 3] as const;
const UPAVON_SI = [13, 9, 3, 1, 17, 5, 11, 7, 15, 4, 14, 18, 2, 8, 16, 6, 12, 10] as const;

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

function makeHoles(yardages: readonly number[]): Hole[] {
  if (yardages.length !== 18) throw new Error(`expected 18 yardages, got ${yardages.length}`);
  return yardages.map((yardage, i) => ({
    hole_number: i + 1,
    yardage,
    par: UPAVON_PAR[i]!,
    stroke_index: UPAVON_SI[i]!,
  }));
}

/** Official Upavon Golf Club scorecard — June 2026. */
const UPAVON: CourseSeed = {
  course_name: "Upavon",
  club_name: "Upavon Golf Club",
  tees: [
    {
      name: "Black",
      color: "black",
      course_rating: 73.4,
      slope_rating: 134,
      par_total: 71,
      yards: 6722,
      holes: makeHoles([
        303, 426, 375, 457, 482, 259, 510, 216, 371, 388, 325, 218, 647, 152, 498, 491, 404, 200,
      ]),
    },
    {
      name: "White",
      color: "white",
      course_rating: 72.0,
      slope_rating: 132,
      par_total: 71,
      yards: 6437,
      holes: makeHoles([
        303, 426, 390, 416, 482, 229, 499, 196, 354, 388, 311, 185, 604, 152, 498, 459, 378, 167,
      ]),
    },
    {
      name: "Yellow",
      color: "yellow",
      course_rating: 70.1,
      slope_rating: 128,
      par_total: 71,
      yards: 6032,
      holes: makeHoles([
        295, 354, 389, 405, 480, 201, 476, 188, 311, 350, 304, 173, 562, 138, 487, 417, 350, 152,
      ]),
    },
    {
      name: "Red",
      color: "red",
      course_rating: 67.6,
      slope_rating: 117,
      par_total: 71,
      yards: 5459,
      holes: makeHoles([
        286, 292, 367, 391, 437, 188, 439, 149, 303, 350, 266, 124, 494, 131, 430, 375, 301, 136,
      ]),
    },
    {
      name: "Red (Ladies)",
      color: "red",
      course_rating: 76.3,
      slope_rating: 134,
      par_total: 71,
      yards: 5459,
      holes: makeHoles([
        286, 292, 367, 391, 437, 188, 439, 149, 303, 350, 266, 124, 494, 131, 430, 375, 301, 136,
      ]),
    },
  ],
};

function validateSeedCourse(course: CourseSeed): void {
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
  const nameVariants = [
    ...new Set([seed.course_name, "Upavon Golf Club", seed.course_name.replace(/[–—]/g, "-")]),
  ];
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
    full_name: seed.club_name,
    club_name: seed.club_name,
    normalized_name: normalizeName(seed.course_name),
    source: SOURCE_LABEL,
    source_type: SOURCE_TYPE,
    source_url: SOURCE_URL,
    sync_status: "ok",
    confidence_score: 100,
    enrichment_status: "imported",
    golfer_data_status: "verified",
    validation_basis: "official_only",
    data_confidence: "high",
    raw_row: {
      source: SOURCE_LABEL,
      seed_name: seed.course_name,
      seeded_via: "scripts/seed-upavon.ts",
      notes: "Official Upavon Golf Club scorecard June 2026 PDF.",
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
  if (upsertErr || !inserted) {
    throw new Error(`Course upsert failed for ${seed.course_name}: ${upsertErr?.message ?? "unknown"}`);
  }
  return String((inserted as { id: string }).id);
}

async function seedCourse(supabase: SupabaseClient, seed: CourseSeed, dryRun: boolean): Promise<void> {
  validateSeedCourse(seed);
  const courseId = await upsertCourseByName(supabase, seed, dryRun);
  console.log(`[upavon-seed] course ok: ${seed.course_name} (course_id=${courseId})`);

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
      console.log(
        `[upavon-seed] dry-run tee: ${seed.course_name} / ${tee.name} (CR=${tee.course_rating}, S=${tee.slope_rating}, ${tee.yards}y)`,
      );
      teeIdByName.set(tee.name, `dry-${normalizeKey(tee.name)}`);
      continue;
    }

    const { data: teeRow, error: teeErr } = await supabase
      .from("course_tees")
      .upsert(teePayload, { onConflict: "course_id,tee_name" })
      .select("id")
      .single();
    if (teeErr || !teeRow) {
      throw new Error(`Tee upsert failed (${seed.course_name} / ${tee.name}): ${teeErr?.message ?? "unknown"}`);
    }
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
        `[upavon-seed] deactivated ${staleTeeIds.length} stale tees for ${seed.course_name}: ${staleTeeIds.join(", ")}`,
      );
    }
  }

  if (dryRun) {
    console.log(`[upavon-seed] dry-run holes: ${seed.course_name} (would replace with ${seed.tees.length * 18} rows)`);
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
  console.log(`[upavon-seed] holes ok: ${seed.course_name} (${holeRows.length} rows)`);
}

async function main(): Promise<void> {
  const dryRun = hasArg("--dry-run");
  const supabase = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  await seedCourse(supabase, UPAVON, dryRun);
  console.log(`[upavon-seed] complete${dryRun ? " (dry-run)" : ""}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[upavon-seed] fatal:", message);
  process.exit(1);
});
