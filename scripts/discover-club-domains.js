#!/usr/bin/env node
/**
 * Club Domain Discovery Crawler
 *
 * Discovers likely official golf club websites for UK courses in Supabase.
 * Generates search queries, fetches results via SerpAPI, extracts domains,
 * scores candidates, and saves top 3 per course.
 *
 * Usage:
 *   node scripts/discover-club-domains.js [options]
 *
 * Options:
 *   --dry-run       Don't write to Supabase
 *   --pilot         Use pilot list from datasets/crawl/pilot-courses.json (20 courses)
 *   --limit N       Process at most N courses (default: 20 for pilot)
 *   --offset N      Skip first N courses
 *   --course ID     Process single course (debug)
 *   --force         Re-process courses that already have candidates
 *
 * Env: SERPAPI_KEY (required for real search), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

try {
  require("dotenv").config({ path: ".env" });
  require("dotenv").config({ path: ".env.local" });
} catch (_) {}

const {
  fetchCourses,
  courseHasDomainCandidates,
  upsertDomainCandidates,
  supabaseAdmin,
} = require("../lib/supabase-admin");
const { extractDomain, scoreDomainCandidate } = require("../lib/domain-scoring");

// --- Parse args ---
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v !== undefined ? (isNaN(Number(v)) ? v : Number(v)) : true;
};
const dryRun = args.includes("--dry-run");
const limit = getArg("--limit", 20);
const offset = getArg("--offset", 0);
const courseId = getArg("--course", null);
const force = args.includes("--force");

const SERPAPI_KEY = process.env.SERPAPI_KEY;

// --- Search query generation ---
function buildSearchQueries(course) {
  const name = (course.name || "").trim();
  const area = (course.area || "").trim();
  const queries = [
    `"${name}"`,
    `${name} golf club`,
    `${name} scorecard`,
    `${name} golf course`,
    area ? `${name} ${area} golf` : null,
  ].filter(Boolean);
  return [...new Set(queries)];
}

// --- SerpAPI search ---
async function searchWithSerpApi(query, count = 10) {
  if (!SERPAPI_KEY) {
    return []; // No key = no results (or use mock in dry-run)
  }
  try {
    const params = new URLSearchParams({
      engine: "bing",
      q: query,
      api_key: SERPAPI_KEY,
      count: String(count),
      cc: "GB",
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    const data = await res.json();
    const results = data.organic_results || [];
    return results.map((r) => ({ url: r.link, title: r.title || "" }));
  } catch (err) {
    console.warn(`  [search] ${query.slice(0, 50)}... failed:`, err.message);
    return [];
  }
}

// --- Mock search for dry-run without API key ---
function mockSearchResults(course) {
  const norm = (course.name || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return [
    { url: `https://www.${norm}-golfclub.co.uk`, title: `${course.name} | Golf Club` },
    { url: `https://${norm}golfclub.com`, title: `${course.name} - Official Site` },
    { url: `https://www.${norm}.co.uk`, title: `${course.name} Golf Course` },
  ];
}

// --- Extract and dedupe domains from search results ---
function extractDomainsFromResults(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const domain = extractDomain(r.url);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, url: r.url, title: r.title || "" });
  }
  return out;
}

// --- Main discovery for one course ---
async function discoverForCourse(course, options = {}) {
  const { dryRun: dr, force: forceReprocess } = options;
  const queries = buildSearchQueries(course);
  const allResults = [];

  for (const q of queries) {
    let results;
    if (SERPAPI_KEY) {
      results = await searchWithSerpApi(q, 8);
    } else if (dr) {
      results = mockSearchResults(course);
    } else {
      console.warn("  [skip] No SERPAPI_KEY; use --dry-run to test with mock data");
      results = [];
    }
    allResults.push(...results);
    if (results.length > 0 && !dr) {
      await new Promise((r) => setTimeout(r, 500)); // rate limit
    }
  }

  const domains = extractDomainsFromResults(allResults);
  const scored = domains.map((d) => {
    const { score } = scoreDomainCandidate({
      domain: d.domain,
      homepageUrl: d.url,
      pageTitle: d.title,
      courseName: course.name,
      area: course.area,
    });
    return { ...d, confidence: score };
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  const top3 = scored.slice(0, 3);

  return top3.map((c) => ({
    domain: c.domain,
    homepage_url: c.url || `https://${c.domain}`,
    confidence: c.confidence,
    source: "discovery",
  }));
}

// Mock courses for dry-run when Supabase not configured
const MOCK_COURSES = [
  { id: "00000000-0000-0000-0000-000000000001", name: "St Andrews Links", area: "Fife" },
  { id: "00000000-0000-0000-0000-000000000002", name: "Royal Birkdale", area: "Southport" },
];

// --- Main ---
async function main() {
  console.log("[discover] Club Domain Discovery");
  console.log("[discover] Options:", { dryRun, pilot, limit, offset, courseId: courseId || "all", force });
  if (!supabaseAdmin && !dryRun) {
    console.error("[discover] Supabase admin not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  let courses;
  if (pilot) {
    const { loadPilotCourses } = require("../lib/supabase-admin");
    courses = loadPilotCourses();
    if (courseId) courses = courses.filter((c) => c.id === courseId);
    else courses = courses.slice(offset, offset + limit);
    if (courses.length === 0) {
      console.log("[discover] Pilot list empty. Run: node scripts/build-pilot-course-list.js");
      return;
    }
    console.log(`[discover] Using pilot list: ${courses.length} courses`);
  } else if (supabaseAdmin) {
    courses = await fetchCourses({ limit: courseId ? 1 : limit, offset: courseId ? 0 : offset, courseId: courseId || undefined, pilot: false });
  } else {
    console.log("[discover] No Supabase - using mock courses for dry-run");
    courses = MOCK_COURSES.slice(0, limit);
  }
  if (courses.length === 0) {
    console.log("[discover] No courses found.");
    return;
  }

  console.log(`[discover] Processing ${courses.length} course(s)`);

  let processed = 0;
  let skipped = 0;

  for (const course of courses) {
    const cid = courseId || course.id;
    const label = `${course.name} (${cid})`;

    if (!force && !dryRun && supabaseAdmin) {
      const has = await courseHasDomainCandidates(cid);
      if (has) {
        console.log(`[skip] ${label} - already has candidates`);
        skipped++;
        continue;
      }
    }

    console.log(`[process] ${label}`);
    const candidates = await discoverForCourse(course, { dryRun, force });
    console.log(`  -> ${candidates.length} candidates:`, candidates.map((c) => `${c.domain} (${c.confidence})`).join(", ") || "none");

    if (!dryRun && candidates.length > 0 && supabaseAdmin) {
      await upsertDomainCandidates(cid, candidates, 3);
      processed++;
    } else if (dryRun) {
      processed++;
    }
  }

  console.log(`[discover] Done. Processed: ${processed}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error("[discover] Error:", err);
  process.exit(1);
});
