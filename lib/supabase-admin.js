/**
 * Supabase admin client for scripts.
 * Uses service role key for bypassing RLS (required for course_domains scripts).
 *
 * Set SUPABASE_SERVICE_ROLE_KEY in .env or environment.
 * For local: copy .env.example to .env and add the key.
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "[supabase-admin] Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY. " +
      "Set these in .env for scripts that need admin access."
  );
}

/**
 * Get Supabase admin client (service role).
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const supabaseAdmin = getSupabaseAdmin();

const PILOT_PATH = path.join(__dirname, "..", "datasets", "crawl", "pilot-courses.json");

/**
 * Load pilot courses from datasets/crawl/pilot-courses.json.
 * @returns {Array<{id: string, name: string, area: string|null}>}
 */
function loadPilotCourses() {
  if (!fs.existsSync(PILOT_PATH)) return [];
  const raw = fs.readFileSync(PILOT_PATH, "utf8");
  const data = JSON.parse(raw);
  return data.courses || [];
}

/**
 * Fetch courses from Supabase with pagination.
 * @param {object} opts
 * @param {number} [opts.limit=100]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.courseId] - Single course for debug
 * @param {boolean} [opts.pilot] - Use pilot list from datasets/crawl/pilot-courses.json
 * @returns {Promise<Array<{id: string, name: string, area: string|null}>>}
 */
async function fetchCourses({ limit = 100, offset = 0, courseId, pilot = false } = {}) {
  if (pilot) {
    const pilotList = loadPilotCourses();
    if (courseId) return pilotList.filter((c) => c.id === courseId);
    return pilotList.slice(offset, offset + limit);
  }
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  let q = supabaseAdmin.from("courses").select("id, course_name, area").order("course_name");
  if (courseId) {
    q = q.eq("id", courseId).limit(1);
  } else {
    q = q.range(offset, offset + limit - 1);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Check if a course already has domain candidates (for skip logic).
 * @param {string} courseId
 * @returns {Promise<boolean>}
 */
async function courseHasDomainCandidates(courseId) {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  const { data, error } = await supabaseAdmin
    .from("course_domains")
    .select("id")
    .eq("course_id", courseId)
    .limit(1);
  if (error) throw error;
  return (data && data.length > 0) || false;
}

/**
 * Upsert domain candidates for a course (top N).
 * @param {string} courseId
 * @param {Array<{domain: string, homepage_url?: string, confidence: number, source: string}>} candidates
 * @param {number} topN
 */
async function upsertDomainCandidates(courseId, candidates, topN = 3) {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  const toInsert = candidates
    .slice(0, topN)
    .map((c) => ({
      course_id: courseId,
      domain: c.domain,
      homepage_url: c.homepage_url || `https://${c.domain}`,
      confidence: c.confidence,
      source: c.source || "discovery",
      status: "candidate",
    }));
  for (const row of toInsert) {
    const { error } = await supabaseAdmin.from("course_domains").upsert(row, {
      onConflict: "course_id,domain",
      ignoreDuplicates: false,
    });
    if (error) throw error;
  }
}

/**
 * Update domain status (e.g. approved, rejected).
 * @param {string} domainId
 * @param {object} updates - { status, notes, confidence, ... }
 */
async function updateDomainStatus(domainId, updates) {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  const { error } = await supabaseAdmin
    .from("course_domains")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", domainId);
  if (error) throw error;
}

/**
 * Insert a course_domain_reviews record.
 * @param {object} row - { course_id, chosen_domain, chosen_url, decision, notes }
 */
async function insertDomainReview(row) {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  const { error } = await supabaseAdmin.from("course_domain_reviews").insert(row);
  if (error) throw error;
}

/**
 * Fetch domain candidates for a course (or all pending).
 * @param {object} opts
 * @param {string} [opts.courseId]
 * @param {string} [opts.status='candidate']
 * @returns {Promise<Array>}
 */
async function fetchDomainCandidates({ courseId, status = "candidate" } = {}) {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  let q = supabaseAdmin
    .from("course_domains")
    .select("*, courses(course_name, area)")
    .eq("status", status)
    .order("confidence", { ascending: false });
  if (courseId) q = q.eq("course_id", courseId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * Fetch courses with their domain candidates (for review UI).
 * @param {object} opts
 * @param {number} [opts.limit=50]
 * @param {number} [opts.offset=0]
 * @param {string} [opts.status='candidate']
 */
async function fetchCoursesWithCandidates({ limit = 50, offset = 0, status = "candidate" } = {}) {
  if (!supabaseAdmin) throw new Error("Supabase admin client not configured");
  const { data: courses, error: e1 } = await supabaseAdmin
    .from("courses")
    .select("id, course_name, area")
    .order("course_name")
    .range(offset, offset + limit - 1);
  if (e1) throw e1;
  if (!courses || courses.length === 0) return [];

  const { data: domains, error: e2 } = await supabaseAdmin
    .from("course_domains")
    .select("id, course_id, domain, homepage_url, confidence, source, status")
    .eq("status", status)
    .in("course_id", courses.map((c) => c.id));
  if (e2) throw e2;

  const byCourse = {};
  for (const d of domains || []) {
    if (!byCourse[d.course_id]) byCourse[d.course_id] = [];
    byCourse[d.course_id].push(d);
  }
  return courses.map((c) => ({
    ...c,
    candidates: (byCourse[c.id] || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
  }));
}

module.exports = {
  getSupabaseAdmin,
  supabaseAdmin,
  loadPilotCourses,
  fetchCourses,
  courseHasDomainCandidates,
  upsertDomainCandidates,
  updateDomainStatus,
  insertDomainReview,
  fetchDomainCandidates,
  fetchCoursesWithCandidates,
};
