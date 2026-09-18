/**
 * Verify OOM 4 Morley Hayes (ZGS & BW) event_results match GameBook NET order.
 *
 * Usage: node scripts/verify-morley-hayes-oom.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "474eef8f-32cf-49fa-a0f0-07db7bc0bf9a";
const ZGS_SOCIETY = "3ddf9225-4220-4f72-80fc-6039ab39b523";
const EXPECTED_PAR = 72;

/** GameBook NET order — guests are BW visitors (0 ZGS OOM). */
const GAMEBOOK = [
  { name: "Bill Gumbura", net: 69, guestId: "2e52a212-30eb-4f6c-9bb2-b1e37bf88fe9" },
  { name: "Andbye Mtandwa", net: 70, guestId: "03caf887-ba9c-4dd9-ac12-4750e43501ad" },
  { name: "Micheal D Handiseni", net: 71, memberId: "b13c38c3-bb27-4843-adaa-3f636ddd23df", zgsOom: 21.5 },
  { name: "Innocent Zinhu", net: 71, guestId: "f2e4a5b0-3172-4980-9524-7f3194c65970" },
  { name: "Alf Sagiya", net: 71, memberId: "9ba584a4-6217-4b7d-be0c-7e5b5ffd9e30", altName: "Alfonse Sagiya", zgsOom: 21.5 },
  { name: "Don Fundira", net: 72, memberId: "c380464f-f1ea-45af-94b4-74a5a7ddeecc", zgsOom: 15 },
  { name: "Tinaye Mharapara", net: 73, guestId: "31dcca19-1de0-4531-b6c8-b9f73870466a" },
  { name: "Tony Galloway", net: 74, memberId: "e5215292-16cc-4974-8d52-9c1af6f53cee", zgsOom: 12 },
  { name: "Ziv Kudenga", net: 75, memberId: "8e36192a-aff7-4f87-b20f-6ed7b2746ab5", zgsOom: 9 },
  { name: "Amos Mataba", net: 75, memberId: "6c0e242f-ec2a-449a-9521-274d8c5556a0", zgsOom: 9 },
  { name: "Fungai Fundira", net: 76, memberId: "4964fd2c-5025-4d38-998a-31e1f1240812", zgsOom: 2.6 },
  { name: "David Sibanda", net: 76, memberId: "455d7000-d414-4fd2-a7ea-63cb96f58e72", zgsOom: 2.6 },
  { name: "Ashton Mandaza", net: 76, memberId: "56a0a942-68a4-4e3d-a989-2a51ee645f52", zgsOom: 2.6 },
  { name: "Adventure Musarurwa", net: 76, memberId: "f9be6700-2133-46be-b657-da8f8601170e", zgsOom: 2.6 },
  { name: "Itai Chinyadza", net: 76, memberId: "2a7df864-c1a9-41e5-b6d6-64a0c047cf66", zgsOom: 2.6 },
  { name: "Dennis Padya", net: 77, memberId: "a419ba96-f006-45bf-b3be-2594c4cebbf8", zgsOom: 0 },
  { name: "Tawanda Moyo", net: 77, memberId: "d984a051-e43a-4eab-9019-867857ca77fb", zgsOom: 0 },
  { name: "Justin Gapara", net: 78, memberId: "da555301-6105-4c8f-bacc-df56824693d0", zgsOom: 0 },
  { name: "Rob Ravu", net: 78, guestId: "31fc2844-2c17-4aef-a862-94b7f0b6559f" },
  { name: "Mandela Govera", net: 78, memberId: "ea83c5c4-145e-4264-8169-cc3eac73bd50", zgsOom: 0 },
  { name: "Martin Mudonhi", net: 79, guestId: "0a34d0f3-56d5-46f3-9c49-beb1add83aa2" },
  { name: "Anotida Senah", net: 79, memberId: "162c2d5a-d226-4324-b90c-3e48d5eb2153", altName: "Anno Senah", zgsOom: 0 },
  { name: "Gari Mbwanda", net: 80, memberId: "1c65157e-d8c0-4a46-bedc-ba003ce9fb58", zgsOom: 0 },
  { name: "Ashley Phiri A", net: 80, memberId: "6466c59a-b005-436c-bd3c-48c7c8318111", altName: "Ashley Phiri", zgsOom: 0 },
  { name: "Farai Mugwagwa", net: 81, memberId: "4979c583-5450-40b0-9b16-03c8f86efb2b", zgsOom: 0 },
  { name: "Edmore Chitokomere", net: 81, guestId: "5b42cc38-5b58-470b-957c-9c253d30155a" },
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
    .select("id, name, par, tee_name, format, course_name")
    .eq("id", EVENT_ID)
    .maybeSingle();
  if (evtErr || !evt) {
    console.error("Event load failed", evtErr);
    process.exit(1);
  }

  console.log("[morley-hayes] event", evt);
  if (evt.par !== EXPECTED_PAR) {
    console.warn(`[morley-hayes] WARN: event par is ${evt.par}, expected Manor White par ${EXPECTED_PAR}`);
  }

  const { data: results, error: resErr } = await sb
    .from("event_results")
    .select("member_id, event_guest_id, day_value, points, position, society_id")
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
    const label = row.name;
    if (!hit) {
      console.error(`[morley-hayes] MISSING result for ${label}`);
      failures++;
      continue;
    }
    const okNet = hit.day_value === row.net;
    const okPos = hit.position === expPos;
    const okOom = Math.abs(Number(hit.points) - expOom) < 0.01;
    const line = {
      player: label,
      net: hit.day_value,
      expectedNet: row.net,
      position: hit.position,
      expectedPosition: expPos,
      oom: Number(hit.points),
      expectedOom: expOom,
      eligible: row.memberId ? "ZGS member" : "BW guest",
    };
    if (!okNet || !okPos || !okOom) {
      console.error("[morley-hayes] MISMATCH", line);
      failures++;
    } else {
      console.log("[morley-hayes] OK", line);
    }
  }

  const memberBill = results?.find((r) => r.member_id === "0ae89415-afb6-4f77-86e7-9ca7f62d7140");
  if (memberBill) {
    console.error("[morley-hayes] STALE: member Bill Gumbura result should be removed (BW guest played)");
    failures++;
  }

  if (failures > 0) {
    console.error(`[morley-hayes] ${failures} failure(s)`);
    process.exit(1);
  }
  console.log("[morley-hayes] all 26 GameBook rows verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
