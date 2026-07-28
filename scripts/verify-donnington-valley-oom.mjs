/**
 * Verify OOM 5 Donnington Major Day 1 event_results match GameBook NET order.
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

/** GameBook NET (par 71 + to par). Malunga excluded (incomplete). */
const GAMEBOOK = [
  { name: "Adventure Musarurwa", net: 68, memberId: "f9be6700-2133-46be-b657-da8f8601170e", zgsOom: 25 },
  { name: "David Sibanda", net: 69, memberId: "455d7000-d414-4fd2-a7ea-63cb96f58e72", zgsOom: 18 },
  { name: "Don Fundira", net: 71, memberId: "c380464f-f1ea-45af-94b4-74a5a7ddeecc", zgsOom: 15 },
  { name: "Tony Ndlovu", net: 74, memberId: "1bc8411a-adc7-4d20-80be-6fc408aa9165", altName: "Sandile Tony Ndlovu", zgsOom: 12 },
  { name: "Elliott Chikwanda", net: 74, guestId: "3bf71fdb-3bc9-4194-be4a-644ad682890d" },
  { name: "Alf Sagiya", net: 75, memberId: "9ba584a4-6217-4b7d-be0c-7e5b5ffd9e30", altName: "Alfonse Sagiya", zgsOom: 9 },
  { name: "Tarisai Kadungure", net: 75, guestId: KADUNGURE_GUEST_ID },
  { name: "Mpho Mokoena", net: 75, memberId: "139c1af3-4268-443d-8111-fa3ba7c5b8fd", zgsOom: 9 },
  { name: "Justin Gapara", net: 76, memberId: "da555301-6105-4c8f-bacc-df56824693d0", zgsOom: 3.25 },
  { name: "Prince Z", net: 76, guestId: "85ceaf2b-0024-4a2d-b25c-241c7a0ae3c7", altName: "Prince Zhandire" },
  { name: "Dennis Padya", net: 76, memberId: "a419ba96-f006-45bf-b3be-2594c4cebbf8", zgsOom: 3.25 },
  { name: "Rob Ravu", net: 76, guestId: "a9562207-2816-4fe8-abdb-6c2d54f5e4b9" },
  { name: "Tawanda Moyo", net: 76, memberId: "d984a051-e43a-4eab-9019-867857ca77fb", zgsOom: 3.25 },
  { name: "Ian Pinks", net: 76, memberId: "0ccef550-83c2-44c5-9744-d1d542ab393d", altName: "Ian Pinkerton", zgsOom: 3.25 },
  { name: "Noble Chigwedere", net: 77, memberId: "d8bdb9f5-8658-4c9c-a867-c2390915463d", altName: "Noble Chhigwedere", zgsOom: 0 },
  { name: "K J Makurumure", net: 78, memberId: "3d90cd38-b711-47b3-a434-b8a17651de24", zgsOom: 0 },
  { name: "Tinaye Mharapara", net: 78, guestId: "d746cdee-caf4-4e82-a608-dd9b299056aa" },
  { name: "Itai Chinyadza", net: 79, memberId: "2a7df864-c1a9-41e5-b6d6-64a0c047cf66", zgsOom: 0 },
  { name: "Shenton Banda", net: 79, guestId: "a57ed881-c7b2-4172-aa03-8a7a4ae0fa5b" },
  { name: "George Tiziraichapwana", net: 79, memberId: "57252422-a31e-403e-bab9-0e40826443de", altName: "George Tizirai-Chapwanya", zgsOom: 0 },
  { name: "Augustine Gorejena", net: 80, guestId: "3e1ed651-b94d-4d4e-b20d-ef8629c18dc2", altName: "Farai Gorejena" },
  { name: "Byron Fundira", net: 81, guestId: "173cab41-063a-45c4-a96a-975725483301", zgsOom: 0 },
  { name: "Max Mandangu", net: 82, guestId: "7debe58c-db76-4434-ace1-912ad622e057", altName: "Max MANDANGU" },
  { name: "Gari Mbwanda", net: 82, memberId: "1c65157e-d8c0-4a46-bedc-ba003ce9fb58", zgsOom: 0 },
];

function expectedPositions() {
  const out = [];
  let pos = 1;
  let i = 0;
  while (i < GAMEBOOK.length) {
    const net = GAMEBOOK[i].net;
    let tieCount = 0;
    while (i + tieCount < GAMEBOOK.length && GAMEBOOK[i + tieCount].net === net) tieCount++;
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

  console.log("[donnington] event", evt);
  if (evt.par !== EXPECTED_PAR) {
    console.warn(`[donnington] WARN: par is ${evt.par}, expected ${EXPECTED_PAR}`);
  }
  if (evt.format !== "strokeplay_net") {
    console.warn(`[donnington] WARN: format is ${evt.format}, expected strokeplay_net for NET OOM`);
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
      console.error(`[donnington] MISSING ${row.name}`);
      failures++;
      continue;
    }
    const ok =
      hit.day_value === row.net &&
      hit.position === expPos &&
      Math.abs(Number(hit.points) - expOom) < 0.01;
    const line = {
      player: row.name,
      net: hit.day_value,
      position: hit.position,
      oom: Number(hit.points),
      expectedOom: expOom,
      kind: row.memberId ? "ZGS member" : "BW guest",
    };
    if (!ok) {
      console.error("[donnington] MISMATCH", { ...line, expectedNet: row.net, expectedPosition: expPos });
      failures++;
    } else {
      console.log("[donnington] OK", line);
    }
  }

  if (failures > 0) {
    console.error(`[donnington] ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("[donnington] all 24 GameBook finishers verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
