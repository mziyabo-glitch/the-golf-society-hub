#!/usr/bin/env node
/**
 * Build Pilot Course List
 *
 * Fetches 20 real courses from Supabase for the domain discovery pilot.
 * Prioritizes: Shrivenham Park, Abbey Hill Golf Centre, Forest of Arden,
 * The Belfry, Woburn, Sunningdale, Wentworth. Fills remaining slots from DB.
 *
 * Output: datasets/crawl/pilot-courses.json
 *
 * Usage:
 *   node scripts/build-pilot-course-list.js
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

try {
  require("dotenv").config({ path: ".env" });
  require("dotenv").config({ path: ".env.local" });
} catch (_) {}

const fs = require("fs");
const path = require("path");
const { supabaseAdmin } = require("../lib/supabase-admin");

const PILOT_NAMES = [
  "Shrivenham Park",
  "Abbey Hill Golf Centre",
  "Forest of Arden",
  "The Belfry",
  "Woburn",
  "Sunningdale",
  "Wentworth",
];

const OUTPUT_PATH = path.join(__dirname, "..", "datasets", "crawl", "pilot-courses.json");
const TARGET_COUNT = 20;

function normalizeForMatch(name) {
  return (name || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function nameMatches(a, b) {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function main() {
  console.log("[build-pilot] Building pilot course list (20 courses)");

  if (!supabaseAdmin) {
    console.error("[build-pilot] Supabase admin not configured.");
    process.exit(1);
  }

  const { data: allCourses, error: fetchErr } = await supabaseAdmin
    .from("courses")
    .select("id, name, area")
    .order("name");

  if (fetchErr) {
    console.error("[build-pilot] Fetch error:", fetchErr);
    process.exit(1);
  }

  if (!allCourses || allCourses.length === 0) {
    console.error("[build-pilot] No courses found in database.");
    process.exit(1);
  }

  const pilot = [];
  const usedIds = new Set();

  // 1. Add priority courses by name match
  for (const want of PILOT_NAMES) {
    const found = allCourses.find((c) => nameMatches(c.name, want));
    if (found && !usedIds.has(found.id)) {
      pilot.push(found);
      usedIds.add(found.id);
      console.log(`  + ${found.name} (priority)`);
    } else {
      console.log(`  - ${want} (not found)`);
    }
  }

  // 2. Fill to TARGET_COUNT from remaining courses
  for (const c of allCourses) {
    if (pilot.length >= TARGET_COUNT) break;
    if (usedIds.has(c.id)) continue;
    pilot.push(c);
    usedIds.add(c.id);
    console.log(`  + ${c.name} (fill)`);
  }

  const output = {
    version: 1,
    created_at: new Date().toISOString(),
    count: pilot.length,
    courses: pilot.map((c) => ({ id: c.id, name: c.name, area: c.area || null })),
  };

  const dir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`[build-pilot] Wrote ${pilot.length} courses to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("[build-pilot] Error:", err);
  process.exit(1);
});
