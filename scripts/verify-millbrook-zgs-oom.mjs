/**
 * Verify ZGS OOM results for OOM 4 - The Millbrook.
 *
 * Usage: node scripts/verify-millbrook-zgs-oom.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "f0267e53-d29a-4301-82ce-ca02160f76cf";
const ZGS = "3ddf9225-4220-4f72-80fc-6039ab39b523";

const EXPECTED = [
  { name: "K J Makurumure", net: 70, position: 1, oom: 25 },
  { name: "Mpho Mokoena", net: 74, position: 4, oom: 18 },
  { name: "Sandile Tony Ndlovu", net: 75, position: 7, oom: 15 },
  { name: "Arthur Ganga", net: 77, position: 9, oom: 12 },
  { name: "Edward Guda", net: 79, position: 11, oom: 10 },
  { name: "Ziv Kudenga", net: 80, position: 16, oom: 5 },
  { name: "Tatenda Chiposi", net: 80, position: 17, oom: 5 },
  { name: "Itai Chinyadza", net: 80, position: 18, oom: 5 },
  { name: "Michael Handiseni", net: 80, position: 19, oom: 5 },
  { name: "Pam Makoni", net: 81, position: 20, oom: 1 / 3 },
  { name: "Noble Chhigwedere", net: 81, position: 21, oom: 1 / 3 },
  { name: "Marshal Konzvo", net: 81, position: 22, oom: 1 / 3 },
];

async function main() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key);

  const { data: evt } = await sb
    .from("events")
    .select("id, name, classification, is_oom, par, format")
    .eq("id", EVENT_ID)
    .maybeSingle();
  console.log("[millbrook] event", evt);

  const { data: results } = await sb
    .from("event_results")
    .select("member_id, event_guest_id, day_value, position, points")
    .eq("event_id", EVENT_ID)
    .eq("society_id", ZGS);

  const { data: members } = await sb.from("members").select("id, name").in("society_id", [ZGS]);
  const { data: guests } = await sb.from("event_guests").select("id, name").eq("event_id", EVENT_ID);
  const nameByMember = new Map((members ?? []).map((m) => [m.id, m.name]));
  const nameByGuest = new Map((guests ?? []).map((g) => [g.id, g.name]));

  let failures = 0;
  for (const exp of EXPECTED) {
    const hit = results?.find((r) => {
      const n = r.member_id ? nameByMember.get(r.member_id) : nameByGuest.get(r.event_guest_id);
      return n && n.toLowerCase().includes(exp.name.split(" ")[0].toLowerCase());
    });
    if (!hit || hit.day_value !== exp.net || hit.position !== exp.position || Math.abs(Number(hit.points) - exp.oom) > 0.02) {
      console.error("[millbrook] MISMATCH", exp, hit);
      failures++;
    } else {
      console.log("[millbrook] OK", exp.name, hit.points);
    }
  }

  console.log(`[millbrook] total ZGS rows: ${results?.length ?? 0}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
