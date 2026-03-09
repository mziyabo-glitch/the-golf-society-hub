#!/usr/bin/env node
/**
 * Approve Club Domain (CLI)
 *
 * Approve or reject a domain candidate for a course.
 * Updates course_domains status and inserts course_domain_reviews.
 *
 * Usage:
 *   node scripts/approve-club-domain.js --course ID --domain ID --action approve|reject [--url URL] [--notes "..."]
 *
 * Options:
 *   --course ID     Course UUID
 *   --domain ID     course_domains.id (the candidate to approve)
 *   --action        approve | reject
 *   --url URL       Chosen homepage URL (for approve)
 *   --notes "..."   Optional notes
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

try {
  require("dotenv").config({ path: ".env" });
  require("dotenv").config({ path: ".env.local" });
} catch (_) {}

const {
  supabaseAdmin,
  updateDomainStatus,
  insertDomainReview,
  fetchDomainCandidates,
} = require("../lib/supabase-admin");

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1];
};
const courseId = getArg("--course");
const domainId = getArg("--domain");
const action = getArg("--action");
const chosenUrl = getArg("--url");
const notes = getArg("--notes");

async function main() {
  if (!courseId || !domainId || !action) {
    console.error("Usage: node scripts/approve-club-domain.js --course ID --domain ID --action approve|reject [--url URL] [--notes ...]");
    process.exit(1);
  }

  const act = action.toLowerCase();
  if (act !== "approve" && act !== "reject") {
    console.error("--action must be 'approve' or 'reject'");
    process.exit(1);
  }

  if (!supabaseAdmin) {
    console.error("Supabase admin not configured.");
    process.exit(1);
  }

  const { data: domain, error: fetchErr } = await supabaseAdmin
    .from("course_domains")
    .select("id, course_id, domain, homepage_url")
    .eq("id", domainId)
    .eq("course_id", courseId)
    .single();

  if (fetchErr || !domain) {
    console.error("Domain candidate not found:", domainId);
    process.exit(1);
  }

  const newStatus = act === "approve" ? "approved" : "rejected";
  await updateDomainStatus(domainId, { status: newStatus, notes: notes || null });

  await insertDomainReview({
    course_id: courseId,
    chosen_domain: act === "approve" ? domain.domain : null,
    chosen_url: act === "approve" ? (chosenUrl || domain.homepage_url) : null,
    decision: act,
    notes: notes || null,
  });

  console.log(`[approve] ${domain.domain} -> ${newStatus}`);
}

main().catch((err) => {
  console.error("[approve] Error:", err);
  process.exit(1);
});
