/**
 * Supabase-backed smoke checks for public invite RSVP (migration 121+).
 *
 * Usage (from repo root, with .env loaded):
 *   node scripts/verify-public-invite-rsvp-e2e.mjs
 *
 * Optional env (see .env.example for base URL/anon key):
 *   VERIFY_INVITE_EVENT_ID   — real event UUID with public invite RPCs deployed
 *   VERIFY_RESOLVE_EMAIL     — email to pass to resolve_public_event_rsvp_member_email_status
 *   VERIFY_RESOLVE_EXPECT    — not_found | unlinked | linked | ambiguous (asserted against RPC)
 *
 * Always checks (anon):
 *   - submit_public_event_rsvp_member_by_email rejects without session (rsvp_auth_required)
 *   - resolve rejects unknown event id (rsvp_event_not_found)
 *
 * Staging sign-off (4 live journeys + SQL): docs/qa-public-invite-rsvp-staging.md
 *
 * Manual QA (real device / two accounts) — run after automated checks pass:
 *   1) Unlinked roster: open /invite/{eventUuid}, member path, email on placeholder row → join-first card;
 *      confirm no new event_registrations row for that member_id (SQL or dashboard).
 *   2) Linked + signed out: same flow with linked email → sign-in card → sign in → land back on invite → In → success.
 *   3) Wrong user: signed in as B, use member email for member A (linked to A) → identity error, no write.
 *   4) Joint event: event with 2+ participant_society_ids; member only in one society → resolve returns linked/unlinked
 *      for that society’s row only; not_found if email exists only outside participant set.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const eventId = process.env.VERIFY_INVITE_EVENT_ID;
const resolveEmail = process.env.VERIFY_RESOLVE_EMAIL;
const resolveExpect = (process.env.VERIFY_RESOLVE_EXPECT || "").trim().toLowerCase();

function fail(msg) {
  console.error("[verify-invite-rsvp] FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("[verify-invite-rsvp] OK:", msg);
}

if (!url || !anonKey) {
  console.log("[verify-invite-rsvp] SKIP: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(0);
}

const sb = createClient(url, anonKey);

const randomUuid = "00000000-0000-4000-8000-000000000001";

// 1) Anon submit must not write — expect rsvp_auth_required
{
  const { error } = await sb.rpc("submit_public_event_rsvp_member_by_email", {
    p_event_id: randomUuid,
    p_email: "anon-check@example.com",
    p_status: "in",
  });
  const msg = error?.message || "";
  if (!msg.includes("rsvp_auth_required") && !msg.includes("Event not found") && !msg.includes("rsvp_event_not_found")) {
    fail(`anon submit: expected rsvp_auth_required (or missing event), got: ${msg || "(no error)"}`);
  }
  ok("anon cannot submit member RSVP by email (auth required or missing event)");
}

// 2) Resolve unknown event
{
  const { data, error } = await sb.rpc("resolve_public_event_rsvp_member_email_status", {
    p_event_id: randomUuid,
    p_email: "resolve-check@example.com",
  });
  if (data && !error) {
    fail("resolve on fake event id should error");
  }
  const msg = error?.message || "";
  if (!msg.includes("rsvp_event_not_found")) {
    fail(`resolve fake event: expected rsvp_event_not_found, got: ${msg || String(data)}`);
  }
  ok("resolve rejects unknown event (rsvp_event_not_found)");
}

if (!eventId) {
  console.log("\n[verify-invite-rsvp] Set VERIFY_INVITE_EVENT_ID (+ optional VERIFY_RESOLVE_EMAIL / VERIFY_RESOLVE_EXPECT) for deeper checks.");
  console.log("[verify-invite-rsvp] Manual QA checklist — run in staging with migration 121 applied:");
  console.log("  1) Unlinked member → join-first card, no event_registrations write");
  console.log("  2) Linked + signed out → sign in → return to invite → RSVP succeeds");
  console.log("  3) Wrong signed-in user + other member email → blocked with clear copy");
  console.log("  4) Joint event → resolver uses participant societies only; ambiguous card if duplicate email across societies");
  process.exit(0);
}

// 3) Invite summary (includes participant_society_ids + host join code after 121)
{
  const { data, error } = await sb.rpc("get_public_event_invite_summary", { p_event_id: eventId });
  if (error) {
    fail(`get_public_event_invite_summary: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.event_id) {
    fail("get_public_event_invite_summary returned no row");
  }
  const parts = Array.isArray(row.participant_society_ids) ? row.participant_society_ids : [];
  ok(`invite summary loaded: event_id=${row.event_id} participants=${parts.length} host_join_code=${row.host_society_join_code ? "set" : "null"}`);
  if (parts.length > 1) {
    console.log("[verify-invite-rsvp] NOTE: joint-style event (multiple participant_society_ids) — resolver counts members only where society_id = ANY(participants ∪ host fallback).");
  }
}

if (resolveEmail && resolveExpect) {
  const { data, error } = await sb.rpc("resolve_public_event_rsvp_member_email_status", {
    p_event_id: eventId,
    p_email: resolveEmail,
  });
  if (error) {
    fail(`resolve test email: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  const st = String(row?.status || "").toLowerCase();
  if (st !== resolveExpect) {
    fail(`resolve expected status '${resolveExpect}', got '${st}' (member_id=${row?.member_id})`);
  }
  ok(`resolve(${resolveEmail}) => ${st} as expected`);
}

console.log("[verify-invite-rsvp] Done.");
