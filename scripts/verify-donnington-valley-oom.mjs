/**
 * Verify OOM 5 Donnington Major Day 1 event_results match GameBook left-hand score order.
 *
 * Usage: node scripts/verify-donnington-valley-oom.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "713eda5f-b8bd-4e24-9d8b-6a350a5e0eb1";
const ZGS_SOCIETY = "3ddf9225-4220-4f72-80fc-6039ab39b523";
const KADUNGURE_GUEST_ID = "a8f3c2d1-9e4b-4a7c-b6d5-1e0f9a8b7c6d";
const EXPECTED_PAR = 71;

/** GameBook left-hand small score column. Malunga excluded (incomplete). */
const GAMEBOOK = [
  { name: "David Sibanda", dayScore: -2, memberId: "455d7000-d414-4fd2-a7ea-63cb96f58e72", zgsOom: 25 },
  { name: "Don Fundira", dayScore: 0, memberId: "c380464f-f1ea-45af-94b4-74a5a7ddeecc", zgsOom: 18 },
  { name: "Adventure Musarurwa", dayScore: 3, memberId: "f9be6700-2133-46be-b657-da8f8601170e", zgsOom: 13.5 },
  { name: "Tony Ndlovu", dayScore: 3, memberId: "1bc8411a-adc7-4d20-80be-6fc408aa9165", altName: "Sandile Tony Ndlovu", zgsOom: 13.5 },
  { name: "Elliott Chikwanda", dayScore: 3, guestId: "3bf71fdb-3bc9-4194-be4a-644ad682890d" },
  { name: "Alf Sagiya", dayScore: 4, memberId: "9ba584a4-6217-4b7d-be0c-7e5b5ffd9e30", altName: "Alfonse Sagiya", zgsOom: 9 },
  { name: "Tarisai Kadungure", dayScore: 4, guestId: KADUNGURE_GUEST_ID },
  { name: "Mpho Mokoena", dayScore: 4, memberId: "139c1af3-4268-443d-8111-fa3ba7c5b8fd", zgsOom: 9 },
  { name: "Justin Gapara", dayScore: 5, memberId: "da555301-6105-4c8f-bacc-df56824693d0", zgsOom: 3.25 },
  { name: "Prince Z", dayScore: 5, guestId: "85ceaf2b-0024-4a2d-b25c-241c7a0ae3c7", altName: "Prince Zhandire" },
  { name: "Dennis Padya", dayScore: 5, memberId: "a419ba96-f006-45bf-b3be-2594c4cebbf8", zgsOom: 3.25 },
  { name: "Rob Ravu", dayScore: 5, guestId: "a9562207-2816-4fe8-abdb-6c2d54f5e4b9" },
  { name: "Tawanda Moyo", dayScore: 5, memberId: "d984a051-e43a-4eab-9019-867857ca77fb", zgsOom: 3.25 },
  { name: "Ian Pinks", dayScore: 5, memberId: "0ccef550-83c2-44c5-9744-d1d542ab393d", altName: "Ian Pinkerton", zgsOom: 3.25 },
  { name: "Noble Chigwedere", dayScore: 6, memberId: "d8bdb9f5-8658-4c9c-a867-c2390915463d", altName: "Noble Chhigwedere", zgsOom: 0 },
  { name: "K J Makurumure", dayScore: 7, memberId: "3d90cd38-b711-47b3-a434-b8a17651de24", zgsOom: 0 },
  { name: "Tinaye Mharapara", dayScore: 7, guestId: "d746cdee-caf4-4e82-a608-dd9b299056aa" },
  { name: "Itai Chinyadza", dayScore: 8, memberId: "2a7df864-c1a9-41e5-b6d6-64a0c047cf66", zgsOom: 0 },
  { name: "Shenton Banda", dayScore: 8, guestId: "a57ed881-c7b2-4172-aa03-8a7a4ae0fa5b" },
  { name: "George Tiziraichapwana", dayScore: 8, memberId: "57252422-a31e-403e-bab9-0e40826443de", altName: "George Tizirai-Chapwanya", zgsOom: 0 },
  { name: "Augustine Gorejena", dayScore: 9, guestId: "3e1ed651-b94d-4d4e-b20d-ef8629c18dc2", altName: "Farai Gorejena" },
  { name: "Byron Fundira", dayScore: 10, guestId: "173cab41-063a-45c4-a96a-975725483301", zgsOom: 0 },
  { name: "Max Mandangu", dayScore: 11, guestId: "7debe58c-db76-4434-ace1-912ad622e057", altName: "Max MANDANGU" },
  { name: "Gari Mbwanda", dayScore: 11, memberId: "1c65157e-d8c0-4a46-bedc-ba003ce9fb58", zgsOom: 0 },
];

function expectedPositions() {
  const out = [];
  let pos = 1;
  let i = 0;
  while (i < GAMEBOOK.length) {
    const dayScore = GAMEBOOK[i].dayScore;
    let tieCount = 0;
    while (i + tieCount < GAMEBOOK.length && GAMEBOOK[i + tieCount].dayScore === dayScore) tieCount++;
    for (let j = 0; j < tieCount; j++) out.push(pos);
    pos += tieCount;
    i += tieCount;
  }
  return out;
}

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key);

  const { data: evt, error: evtErr } = await sb
    .from("events")
    .select("id, name, par, format, course_name")
    .eq("id", EVENT_ID)
    .maybeSingle();
  if (evtErr || !evt) {
    console.error("Event load failed", evtErr);
    process.exit(1);
  }

  console.log("[donnington-valley] event", evt);
  if (evt.par !== EXPECTED_PAR) {
    console.warn(`[donnington-valley] WARN: par is ${evt.par}, expected ${EXPECTED_PAR}`);
  }
  if (evt.format !== "stableford") {
    console.warn(`[donnington-valley] WARN: format is ${evt.format}, expected stableford for GameBook left-hand OOM`);
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

  const positions = expectedPositions();
  let failures = 0;

  for (let i = 0; i < GAMEBOOK.length; i++) {
    const row = GAMEBOOK[i];
    const expPos = positions[i];
    const hit = results?.find((r) =>
      row.memberId ? r.member_id === row.memberId : r.event_guest_id === row.guestId,
    );
    const expOom = row.zgsOom ?? 0;
    if (!hit) {
      console.error(`[donnington-valley] MISSING ${row.name}`);
      failures++;
      continue;
    }
    const ok =
      hit.day_value === row.dayScore &&
      hit.position === expPos &&
      Math.abs(Number(hit.points) - expOom) < 0.01;
    const line = {
      player: row.name,
      dayScore: hit.day_value,
      position: hit.position,
      oom: Number(hit.points),
      expectedOom: expOom,
      kind: row.memberId ? "ZGS member" : "BW guest",
    };
    if (!ok) {
      console.error("[donnington-valley] MISMATCH", { ...line, expectedDayScore: row.dayScore, expectedPosition: expPos });
      failures++;
    } else {
      console.log("[donnington-valley] OK", line);
    }
  }

  if (failures > 0) {
    console.error(`[donnington-valley] ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("[donnington-valley] all 24 GameBook finishers verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
