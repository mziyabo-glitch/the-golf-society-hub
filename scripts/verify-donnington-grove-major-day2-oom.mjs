/**
 * Verify Donnington Grove Major Day 2 event_results use Today (net-to-par) for Day 2 OOM.
 *
 * Usage: node scripts/verify-donnington-grove-major-day2-oom.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "400c8e95-e256-48b6-88fa-15966e5b3ae8";
const ZGS_SOCIETY = "3ddf9225-4220-4f72-80fc-6039ab39b523";
const KADUNGURE_GUEST_ID = "c4d5e6f7-8a9b-4c0d-9e1f-2a3b4c5d6e7f";
const EXPECTED_PAR = 72;

const F1_OOM = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function getOOMPointsForPosition(position) {
  if (position >= 1 && position <= 10) return F1_OOM[position - 1];
  return 0;
}

function getAveragedOOMPoints(startPosition, tieCount) {
  if (tieCount <= 0) return 0;
  let total = 0;
  for (let i = 0; i < tieCount; i++) total += getOOMPointsForPosition(startPosition + i);
  return total / tieCount;
}

/** GameBook Day 2 Stableford NET — Today column order. */
const GAMEBOOK = [
  { name: "Adventure Musarurwa", today: -6, memberId: "f9be6700-2133-46be-b657-da8f8601170e" },
  { name: "David Sibanda", today: 0, memberId: "455d7000-d414-4fd2-a7ea-63cb96f58e72" },
  { name: "Don Fundira", today: -4, memberId: "c380464f-f1ea-45af-94b4-74a5a7ddeecc" },
  { name: "Elliott Chikwanda", today: -2, guestId: "3d69099e-304c-489b-a471-278a4c59dcb3" },
  { name: "Tony Ndlovu", today: -1, memberId: "1bc8411a-adc7-4d20-80be-6fc408aa9165" },
  { name: "Mpho Mokoena", today: -3, memberId: "139c1af3-4268-443d-8111-fa3ba7c5b8fd" },
  { name: "Alf Sagiya", today: 0, memberId: "9ba584a4-6217-4b7d-be0c-7e5b5ffd9e30" },
  { name: "Tarisai Kadungure", today: 0, guestId: KADUNGURE_GUEST_ID },
  { name: "Ian Pinks", today: -5, memberId: "0ccef550-83c2-44c5-9744-d1d542ab393d" },
  { name: "Tawanda Moyo", today: -1, memberId: "d984a051-e43a-4eab-9019-867857ca77fb" },
  { name: "Rob Ravu", today: 2, guestId: "48f85e8a-915d-4ea1-80d5-935e68914f27" },
  { name: "Dennis Padya", today: 2, memberId: "a419ba96-f006-45bf-b3be-2594c4cebbf8" },
  { name: "Prince Z", today: 3, guestId: "a9fd6876-21a5-4cf4-82ff-5d8840812a71" },
  { name: "Justin Gapara", today: 4, memberId: "da555301-6105-4c8f-bacc-df56824693d0" },
  { name: "Noble Chigwedere", today: 1, memberId: "d8bdb9f5-8658-4c9c-a867-c2390915463d" },
  { name: "Derick Malunga", today: 6, memberId: "4e1bd7af-e9b7-4ad0-80e1-f1b2001c7d3f" },
  { name: "Tinaye Mharapara", today: 4, guestId: "e036a22e-1cb9-47ba-b0c3-9f2a066d0ffa" },
  { name: "K J Makurumure", today: 3, memberId: "3d90cd38-b711-47b3-a434-b8a17651de24" },
  { name: "George Tiziraichapwana", today: 5, memberId: "57252422-a31e-403e-bab9-0e40826443de" },
  { name: "Shenton Banda", today: 6, guestId: "2af3b9f1-8546-4cbe-ab26-493dbdecefe8" },
  { name: "Itai Chinyadza", today: 9, memberId: "2a7df864-c1a9-41e5-b6d6-64a0c047cf66" },
  { name: "Augustine Gorejena", today: 6, guestId: "139193c1-cb7c-4a68-84a9-ee3c131e840f" },
  { name: "Byron Fundira", today: 5, guestId: "90dbdd70-c133-4f6b-9077-56b99cafd7ca" },
  { name: "Gari Mbwanda", today: 4, memberId: "1c65157e-d8c0-4a46-bedc-ba003ce9fb58" },
  { name: "Robson Kashora", today: 4, guestId: "0627f625-9b3d-42fd-b3a5-ed57d3245934" },
];

function scoreField(rows) {
  const sorted = [...rows].sort((a, b) => a.today - b.today);
  const positioned = [];
  let pos = 1;
  let i = 0;
  while (i < sorted.length) {
    const val = sorted[i].today;
    let tie = 1;
    while (i + tie < sorted.length && sorted[i + tie].today === val) tie++;
    for (let j = 0; j < tie; j++) {
      positioned.push({ ...sorted[i + j], position: pos, zgsOom: 0 });
    }
    pos += tie;
    i += tie;
  }

  const members = positioned.filter((p) => p.memberId);
  let mRank = 1;
  let mi = 0;
  while (mi < members.length) {
    const val = members[mi].today;
    let tie = 1;
    while (mi + tie < members.length && members[mi + tie].today === val) tie++;
    const pts = getAveragedOOMPoints(mRank, tie);
    for (let j = 0; j < tie; j++) members[mi + j].zgsOom = pts;
    mRank += tie;
    mi += tie;
  }
  return positioned;
}

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key);

  const expected = scoreField(GAMEBOOK);

  const { data: evt, error: evtErr } = await sb
    .from("events")
    .select("id, name, par, format, classification, is_oom")
    .eq("id", EVENT_ID)
    .maybeSingle();
  if (evtErr || !evt) {
    console.error("Event load failed", evtErr);
    process.exit(1);
  }

  console.log("[donnington-grove-day2] event", evt);
  if (evt.classification !== "major") {
    console.error(`[donnington-grove-day2] expected classification major, got ${evt.classification}`);
    process.exit(1);
  }
  if (evt.par !== EXPECTED_PAR) {
    console.warn(`[donnington-grove-day2] WARN: par is ${evt.par}, expected ${EXPECTED_PAR}`);
  }

  const { data: results, error: resErr } = await sb
    .from("event_results")
    .select("member_id, event_guest_id, day_value, points, position")
    .eq("event_id", EVENT_ID)
    .eq("society_id", ZGS_SOCIETY);
  if (resErr) {
    console.error(resErr);
    process.exit(1);
  }

  let failures = 0;
  for (const row of expected) {
    const hit = results?.find((r) =>
      row.memberId ? r.member_id === row.memberId : r.event_guest_id === row.guestId,
    );
    const expOom = row.memberId ? row.zgsOom : 0;
    if (!hit) {
      console.error(`[donnington-grove-day2] MISSING ${row.name}`);
      failures++;
      continue;
    }
    const ok =
      hit.day_value === row.today &&
      hit.position === row.position &&
      Math.abs(Number(hit.points) - expOom) < 0.01;
    const line = {
      player: row.name,
      today: hit.day_value,
      position: hit.position,
      oom: Number(hit.points),
      expectedOom: expOom,
      kind: row.memberId ? "ZGS member" : "guest",
    };
    if (!ok) {
      console.error("[donnington-grove-day2] MISMATCH", {
        ...line,
        expectedToday: row.today,
        expectedPosition: row.position,
      });
      failures++;
    } else {
      console.log("[donnington-grove-day2] OK", line);
    }
  }

  if (failures > 0) {
    console.error(`[donnington-grove-day2] ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("[donnington-grove-day2] all 25 GameBook finishers verified (Today-based Day 2 OOM)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
