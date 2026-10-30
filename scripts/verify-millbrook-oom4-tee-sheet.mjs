/**
 * Read-only verification for OOM 4 - The Millbrook tee sheet persistence.
 *
 * Usage: node scripts/verify-millbrook-oom4-tee-sheet.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "f0267e53-d29a-4301-82ce-ca02160f76cf";
const M4_SOCIETY = "0eb58347-7da5-49b5-b908-ee80d246a389";
const ZGS_SOCIETY = "3ddf9225-4220-4f72-80fc-6039ab39b523";

const TARGET_GROUPS = [
  ["Fungai Fundira", "Edward Guda", "David Sibanda", "Aulia Alfazema"],
  ["Arthur Ganga", "Mpho Mokoena", "Justin Gapara", "K J Makurumure"],
  ["Tyno Rudenya", "Terry M", "Ian Pinkerton", "Bernie Nyasulu"],
  ["Ziv Kudenga", "Gorejena Farai", "Noble Chigwedere", "Michael Handiseni"],
  ["Marshal Konzvo", "Mandela Govera", "Nigel Musara", "Don Govere"],
  ["Deborah Mohale", "Tafadzwa Mangwiza", "Tank Zikwature", "Itai Chinyadza"],
  ["Simba Mash", "Fungayi Useya", "Tatenda Chiposi"],
  ["Niyi Olaniyan", "Kenny G", "Bongai Mlambo", "Sidney Nhavira"],
  ["Nyasha McCarthy", "Tawanda Moyo", "Sandile Tony Ndlovu", "Danny Matome"],
  ["Tichafa Muromo", "Alan McCarthy", "Alwyn Hunda", "Alfonse Sagiya"],
  ["Jade Muchando", "Munya Kamwaza", "Pam Makoni"],
  ["Sunday Babalola", "Seane Tendai Chasi", "Brian Manyanga", "Taku Vimbe"],
  ["David Nyoni", "Isaya", "Byron Matebe Fundira"],
];

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function namesMatch(targetNorm, candidateNorm) {
  if (targetNorm === candidateNorm) return true;
  if (targetNorm.length >= 3 && candidateNorm.startsWith(targetNorm)) return true;
  if (candidateNorm.length >= 3 && targetNorm.startsWith(candidateNorm)) return true;
  const tParts = targetNorm.split(" ");
  if (tParts.length === 1 && tParts[0].length >= 3) {
    return candidateNorm.split(" ").some((p) => p === tParts[0] || p.startsWith(tParts[0]));
  }
  return false;
}

function verifyNamesEquivalent(expected, actual) {
  const e = normName(expected);
  const a = normName(actual);
  if (e === a || namesMatch(e, a)) return true;
  const pairs = [
    ["noble chigwedere", "noble chhigwedere"],
    ["gorejena farai", "gorejena farai"],
  ];
  return pairs.some(([x, y]) => (e === x && a === y) || (e === y && a === x));
}

async function loadCurrentGroups(sb) {
  const { data: entries } = await sb
    .from("event_entries")
    .select("pairing_group, pairing_position, player_id")
    .eq("event_id", EVENT_ID)
    .not("pairing_group", "is", null)
    .order("pairing_group")
    .order("pairing_position");

  const { data: guestRows } = await sb
    .from("tee_group_players")
    .select("group_number, position, player_id")
    .eq("event_id", EVENT_ID)
    .like("player_id", "guest-%")
    .order("group_number")
    .order("position");

  const memberIds = [...new Set((entries ?? []).map((e) => e.player_id).filter(Boolean))];
  const guestIds = [
    ...new Set((guestRows ?? []).map((r) => String(r.player_id).slice("guest-".length)).filter(Boolean)),
  ];

  const { data: members } = await sb
    .from("members")
    .select("id, name")
    .in("id", memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data: guests } = await sb
    .from("event_guests")
    .select("id, name")
    .in("id", guestIds.length ? guestIds : ["00000000-0000-0000-0000-000000000000"]);

  const memberNameById = new Map((members ?? []).map((m) => [m.id, m.name]));
  const guestNameById = new Map((guests ?? []).map((g) => [g.id, g.name]));

  const byGroup = new Map();
  for (const e of entries ?? []) {
    const gn = Number(e.pairing_group);
    if (!byGroup.has(gn)) byGroup.set(gn, []);
    byGroup.get(gn).push({
      position: e.pairing_position ?? 0,
      name: memberNameById.get(e.player_id) ?? e.player_id,
      playerId: e.player_id,
      kind: "member",
    });
  }
  for (const r of guestRows ?? []) {
    const gn = Number(r.group_number);
    const gid = String(r.player_id).slice("guest-".length);
    if (!byGroup.has(gn)) byGroup.set(gn, []);
    byGroup.get(gn).push({
      position: r.position ?? 0,
      name: guestNameById.get(gid) ?? r.player_id,
      playerId: r.player_id,
      kind: "guest",
    });
  }

  return [...byGroup.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([groupNumber, players]) => ({
      groupNumber,
      players: players.sort((a, b) => a.position - b.position).map((p) => p.name),
      playerIds: players.sort((a, b) => a.position - b.position).map((p) => p.playerId),
    }));
}

function diffGroups(expected, actual) {
  const diffs = [];
  for (let i = 0; i < expected.length; i++) {
    const exp = expected[i];
    const act = actual[i];
    if (!act) {
      diffs.push({ group: i + 1, issue: "missing_group", expected: exp, actual: null });
      continue;
    }
    if (exp.length !== act.players.length) {
      diffs.push({ group: i + 1, issue: "player_count", expected: exp, actual: act.players });
      continue;
    }
    for (let j = 0; j < exp.length; j++) {
      if (!verifyNamesEquivalent(exp[j], act.players[j])) {
        diffs.push({
          group: i + 1,
          position: j,
          issue: "name_mismatch",
          expected: exp[j],
          actual: act.players[j],
        });
      }
    }
  }
  if (actual.length > expected.length) {
    for (let i = expected.length; i < actual.length; i++) {
      diffs.push({ group: i + 1, issue: "extra_group", expected: null, actual: actual[i].players });
    }
  }
  return diffs;
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Missing Supabase env");

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: event } = await sb
    .from("events")
    .select("id, name, tee_time_start, tee_time_interval, tee_time_published_at")
    .eq("id", EVENT_ID)
    .single();

  const { data: societies } = await sb.from("event_societies").select("society_id").eq("event_id", EVENT_ID);

  const { data: teeGroups } = await sb
    .from("tee_groups")
    .select("group_number, tee_time")
    .eq("event_id", EVENT_ID)
    .order("group_number");

  const { data: allTeePlayers } = await sb
    .from("tee_group_players")
    .select("player_id, group_number, position")
    .eq("event_id", EVENT_ID);

  const { data: allEntries } = await sb
    .from("event_entries")
    .select("id, player_id, pairing_group, pairing_position, status")
    .eq("event_id", EVENT_ID);

  const { data: regs } = await sb
    .from("event_registrations")
    .select("member_id, status, paid, society_id, removed_from_event_at")
    .eq("event_id", EVENT_ID);

  const { data: guests } = await sb.from("event_guests").select("id, name, society_id, paid").eq("event_id", EVENT_ID);

  const groups = await loadCurrentGroups(sb);
  const verificationDiff = diffGroups(TARGET_GROUPS, groups);

  const allPlayerIds = [
    ...(allEntries ?? []).filter((e) => e.pairing_group != null).map((e) => e.player_id),
    ...(allTeePlayers ?? []).map((r) => r.player_id),
  ];
  const dupes = allPlayerIds.filter((id, i) => allPlayerIds.indexOf(id) !== i);

  const pairedMemberIds = new Set(
    (allEntries ?? []).filter((e) => e.pairing_group != null).map((e) => e.player_id),
  );
  const pairedGuestIds = new Set(
    (allTeePlayers ?? [])
      .filter((r) => String(r.player_id).startsWith("guest-"))
      .map((r) => r.player_id),
  );

  const paidRegs = (regs ?? []).filter(
    (r) => !r.removed_from_event_at && r.status === "in" && r.paid === true,
  );
  const paidGuests = (guests ?? []).filter((g) => g.paid === true);

  const notEligible = (regs ?? []).filter(
    (r) => !r.removed_from_event_at && r.status === "in" && r.paid !== true,
  );

  const targetPlayerCount = TARGET_GROUPS.flat().length;
  const actualPlayerCount = groups.reduce((s, g) => s + g.players.length, 0);

  console.log(
    JSON.stringify(
      {
        phase: "verify",
        eventId: EVENT_ID,
        eventName: event?.name,
        published: !!event?.tee_time_published_at,
        isJoint: (societies ?? []).length >= 2,
        participatingSocieties: societies?.map((s) => s.society_id) ?? [],
        teeGroupsCount: teeGroups?.length ?? 0,
        teeGroupPlayersCount: allTeePlayers?.length ?? 0,
        eventEntriesWithPairing: (allEntries ?? []).filter((e) => e.pairing_group != null).length,
        groupCount: groups.length,
        expectedGroupCount: TARGET_GROUPS.length,
        playerCount: actualPlayerCount,
        expectedPlayerCount: targetPlayerCount,
        duplicatePlayerIds: [...new Set(dupes)],
        verificationDiff,
        verified: verificationDiff.length === 0 && groups.length === TARGET_GROUPS.length,
        pool: {
          paidMemberRegs: paidRegs.length,
          paidGuests: paidGuests.length,
          m4Paid: paidRegs.filter((r) => r.society_id === M4_SOCIETY).length,
          zgsPaid: paidRegs.filter((r) => r.society_id === ZGS_SOCIETY).length,
          notEligiblePayment: notEligible.length,
        },
        groups,
      },
      null,
      2,
    ),
  );

  if (verificationDiff.length > 0 || groups.length !== TARGET_GROUPS.length) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[verify-millbrook] fatal:", e?.message || String(e));
  process.exit(1);
});
