#!/usr/bin/env node
/**
 * Score Domain Candidates
 *
 * Re-scores existing course_domains candidates (e.g. after fetching page titles).
 * Can optionally fetch homepage to get title for better scoring.
 *
 * Usage:
 *   node scripts/score-domain-candidates.js [options]
 *
 * Options:
 *   --dry-run       Don't write to Supabase
 *   --limit N       Process at most N courses (default: 50)
 *   --offset N      Skip first N courses
 *   --course ID     Process single course (debug)
 *   --fetch-titles  Fetch homepage to get page title (adds latency)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

try {
  require("dotenv").config({ path: ".env" });
  require("dotenv").config({ path: ".env.local" });
} catch (_) {}

const { supabaseAdmin } = require("../lib/supabase-admin");
const { scoreDomainCandidate } = require("../lib/domain-scoring");

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v !== undefined ? (isNaN(Number(v)) ? v : Number(v)) : true;
};
const dryRun = args.includes("--dry-run");
const limit = getArg("--limit", 50);
const offset = getArg("--offset", 0);
const courseId = getArg("--course", null);
const fetchTitles = args.includes("--fetch-titles");

async function fetchPageTitle(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "GolfSocietyHub/1.0 (domain discovery)" },
    });
    clearTimeout(timeout);
    const html = await res.text();
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log("[score] Domain Candidate Scoring");
  console.log("[score] Options:", { dryRun, limit, offset, courseId: courseId || "all", fetchTitles });

  if (!supabaseAdmin) {
    console.error("[score] Supabase admin not configured.");
    process.exit(1);
  }

  let q = supabaseAdmin
    .from("course_domains")
    .select("id, course_id, domain, homepage_url, confidence, courses(course_name, area)")
    .eq("status", "candidate");

  if (courseId) q = q.eq("course_id", courseId);

  const { data: rows, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  if (!rows || rows.length === 0) {
    console.log("[score] No candidates to score.");
    return;
  }

  console.log(`[score] Processing ${rows.length} candidate(s)`);

  for (const row of rows) {
    const course = row.courses || {};
    let pageTitle = null;
    if (fetchTitles && row.homepage_url) {
      pageTitle = await fetchPageTitle(row.homepage_url);
      if (pageTitle) console.log(`  [title] ${row.domain}: ${pageTitle.slice(0, 50)}...`);
      await new Promise((r) => setTimeout(r, 300)); // rate limit
    }

    const { score } = scoreDomainCandidate({
      domain: row.domain,
      homepageUrl: row.homepage_url,
      pageTitle,
      courseName: course.course_name ?? "",
      area: course.area || null,
    });

    const oldConf = row.confidence;
    console.log(`  ${row.domain}: ${oldConf} -> ${score}`);

    if (!dryRun) {
      await supabaseAdmin
        .from("course_domains")
        .update({ confidence: score, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  console.log("[score] Done.");
}

main().catch((err) => {
  console.error("[score] Error:", err);
  process.exit(1);
});
