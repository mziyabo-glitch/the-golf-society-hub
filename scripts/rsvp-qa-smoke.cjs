/**
 * Lightweight smoke checks for RSVP stat helpers (mirrors lib/eventRsvpStats.ts).
 * Run: npm run test:rsvp
 */
"use strict";

const assert = require("assert");

function normalizeRsvpGuestNameForDedupe(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function countExtraGuestRowsBeyondUniqueNames(guests) {
  if (guests.length === 0) return 0;
  const keys = new Set(guests.map((g) => normalizeRsvpGuestNameForDedupe(g.name)));
  return Math.max(0, guests.length - keys.size);
}

function countMembersWithNoSocietyRsvpRow(members, regs) {
  const regIds = new Set(regs.map((r) => String(r.member_id)));
  return members.reduce((acc, m) => acc + (regIds.has(String(m.id)) ? 0 : 1), 0);
}

assert.strictEqual(normalizeRsvpGuestNameForDedupe("  John   SMITH "), "john smith");
assert.strictEqual(countExtraGuestRowsBeyondUniqueNames([{ name: "a" }, { name: "A " }]), 1);
assert.strictEqual(countExtraGuestRowsBeyondUniqueNames([{ name: "x" }, { name: "y" }]), 0);
assert.strictEqual(
  countMembersWithNoSocietyRsvpRow([{ id: "1" }, { id: "2" }], [{ member_id: "1" }]),
  1,
);

console.log("[rsvp-qa-smoke] ok");
