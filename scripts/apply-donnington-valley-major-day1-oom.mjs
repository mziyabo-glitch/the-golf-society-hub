/**
 * Apply ZGS Donnington Valley Major Day 1 (Stableford NET Today) event_results.
 * Day 1 OOM uses GameBook "Today" (net-to-par), not cumulative tournament standing.
 *
 * Usage: node scripts/apply-donnington-valley-major-day1-oom.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "713eda5f-b8bd-4e24-9d8b-6a350a5e0eb1";
const ZGS_SOCIETY = "3ddf9225-4220-4f72-80fc-6039ab39b523";
const KADUNGURE_GUEST_ID = "a8f3c2d1-9e4b-4a7c-b6d5-1e0f9a8b7c6d";

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

/** GameBook Day 1 Stableford NET — Today column (signed net-to-par). Malunga excluded. */
const GAMEBOOK = [
  { name: "Adventure Musarurwa", today: -3, memberId: "f9be6700-2133-46be-b657-da8f8601170e" },
  { name: "David Sibanda", today: -2, memberId: "455d7000-d414-4fd2-a7ea-63cb96f58e72" },
  { name: "Don Fundira", today: 0, memberId: "c380464f-f1ea-45af-94b4-74a5a7ddeecc" },
  { name: "Tony Ndlovu", today: 3, memberId: "1bc8411a-adc7-4d20-80be-6fc408aa9165", altName: "Sandile Tony Ndlovu" },
  { name: "Elliott Chikwanda", today: 3, guestId: "3bf71fdb-3bc9-4194-be4a-644ad682890d" },
  { name: "Alf Sagiya", today: 4, memberId: "9ba584a4-6217-4b7d-be0c-7e5b5ffd9e30", altName: "Alfonse Sagiya" },
  { name: "Tarisai Kadungure", today: 4, guestId: KADUNGURE_GUEST_ID },
  { name: "Mpho Mokoena", today: 4, memberId: "139c1af3-4268-443d-8111-fa3ba7c5b8fd" },
  { name: "Justin Gapara", today: 5, memberId: "da555301-6105-4c8f-bacc-df56824693d0" },
  { name: "Prince Z", today: 5, guestId: "85ceaf2b-0024-4a2d-b25c-241c7a0ae3c7", altName: "Prince Zhandire" },
  { name: "Dennis Padya", today: 5, memberId: "a419ba96-f006-45bf-b3be-2594c4cebbf8" },
  { name: "Rob Ravu", today: 5, guestId: "a9562207-2816-4fe8-abdb-6c2d54f5e4b9" },
  { name: "Tawanda Moyo", today: 5, memberId: "d984a051-e43a-4eab-9019-867857ca77fb" },
  { name: "Ian Pinks", today: 5, memberId: "0ccef550-83c2-44c5-9744-d1d542ab393d", altName: "Ian Pinkerton" },
  { name: "Noble Chigwedere", today: 6, memberId: "d8bdb9f5-8658-4c9c-a867-c2390915463d", altName: "Noble Chhigwedere" },
  { name: "K J Makurumure", today: 7, memberId: "3d90cd38-b711-47b3-a434-b8a17651de24" },
  { name: "Tinaye Mharapara", today: 7, guestId: "d746cdee-caf4-4e82-a608-dd9b299056aa" },
  { name: "Itai Chinyadza", today: 8, memberId: "2a7df864-c1a9-41e5-b6d6-64a0c047cf66" },
  { name: "Shenton Banda", today: 8, guestId: "a57ed881-c7b2-4172-aa03-8a7a4ae0fa5b" },
  { name: "George Tiziraichapwana", today: 8, memberId: "57252422-a31e-403e-bab9-0e40826443de", altName: "George Tizirai-Chapwanya" },
  { name: "Augustine Gorejena", today: 9, guestId: "3e1ed651-b94d-4d4e-b20d-ef8629c18dc2", altName: "Farai Gorejena" },
  { name: "Byron Fundira", today: 10, guestId: "173cab41-063a-45c4-a96a-975725483301" },
  { name: "Max Mandangu", today: 11, guestId: "7debe58c-db76-4434-ace1-912ad622e057", altName: "Max MANDANGU" },
  { name: "Gari Mbwanda", today: 11, memberId: "1c65157e-d8c0-4a46-bedc-ba003ce9fb58" },
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

  const scored = scoreField(GAMEBOOK);
  console.log("[donnington-valley-day1] scored field", scored.map((p) => ({
    name: p.name,
    today: p.today,
    position: p.position,
    zgsOom: p.zgsOom ?? 0,
    kind: p.memberId ? "member" : "guest",
  })));

  const { error: evtErr } = await sb
    .from("events")
    .update({ format: "stableford", classification: "oom", is_oom: true })
    .eq("id", EVENT_ID);
  if (evtErr) {
    console.error("[donnington-valley-day1] event update failed", evtErr);
    process.exit(1);
  }
  console.log("[donnington-valley-day1] event format -> stableford, classification -> oom");

  const { error: delErr } = await sb
    .from("event_results")
    .delete()
    .eq("event_id", EVENT_ID)
    .eq("society_id", ZGS_SOCIETY);
  if (delErr) {
    console.error("[donnington-valley-day1] delete existing results failed", delErr);
    process.exit(1);
  }

  const rows = scored.map((p) => ({
    event_id: EVENT_ID,
    society_id: ZGS_SOCIETY,
    member_id: p.memberId ?? null,
    event_guest_id: p.guestId ?? null,
    day_value: p.today,
    position: p.position,
    points: p.memberId ? p.zgsOom : 0,
  }));

  const { error: insErr } = await sb.from("event_results").insert(rows);
  if (insErr) {
    console.error("[donnington-valley-day1] insert results failed", insErr);
    process.exit(1);
  }

  console.log(`[donnington-valley-day1] inserted ${rows.length} event_results`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
