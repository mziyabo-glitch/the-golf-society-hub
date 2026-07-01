/**
 * Apply ZGS OOM results for OOM 4 - The Millbrook (stroke play NET, par 74).
 * Joint M4/ZGS: full 46-player field for ranking; ZGS society rows for ZGS members + guests only.
 *
 * Usage: node scripts/apply-millbrook-zgs-oom.mjs
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const EVENT_ID = "f0267e53-d29a-4301-82ce-ca02160f76cf";
const ZGS = "3ddf9225-4220-4f72-80fc-6039ab39b523";

const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const getPts = (p) => (p >= 1 && p <= 10 ? F1[p - 1] : 0);
const avgPts = (start, tie) => {
  let t = 0;
  for (let i = 0; i < tie; i++) t += getPts(start + i);
  return t / tie;
};

/** GameBook NET order — exact positions from organiser sheet. */
const GAMEBOOK = [
  { pos: 1, name: "K J Makurumure", net: 70, memberId: "3d90cd38-b711-47b3-a434-b8a17651de24", zgs: true },
  { pos: 2, name: "Augustine Gorejena", net: 73, memberId: "7e02f3ba-9c44-4aa3-89b7-c0a1f9d74075", zgs: false },
  { pos: 3, name: "Terence Mokom", net: 73, fieldOnly: true },
  { pos: 4, name: "Mpho Mokoena", net: 74, memberId: "139c1af3-4268-443d-8111-fa3ba7c5b8fd", zgs: true },
  { pos: 5, name: "Jade Muchando", net: 75, memberId: "e2753b26-5c71-410a-9c96-097021e95045", zgs: false },
  { pos: 6, name: "Simba Mash", net: 75, memberId: "901859ff-7b3b-4b02-8315-5876759755e1", zgs: false },
  { pos: 7, name: "Tony Ndlovu", net: 75, memberId: "1bc8411a-adc7-4d20-80be-6fc408aa9165", zgs: true },
  { pos: 8, name: "David Nyoni", net: 76, memberId: "ef711b65-9b83-43bc-9b1f-91a67a969c4b", zgs: false },
  { pos: 9, name: "Arthur Ganga", net: 77, memberId: "4a127fa5-72cd-469c-9e47-308e54e1185b", zgs: true },
  { pos: 10, name: "Bernie Nyasulu", net: 77, guestId: "06924405-cfdf-45ca-be8f-a308f4be570f" },
  { pos: 11, name: "Edward Guda", net: 79, memberId: "28b6d02f-6f43-4542-83af-ecdd81e164aa", zgs: true },
  { pos: 12, name: "Aulia Alfazema", net: 79, guestId: "f77ffb9c-fb2f-4525-88a8-6e270c7cc178" },
  { pos: 13, name: "TonKennedy Nyemba", net: 79, guestId: "d9ed53c4-e97b-42ff-9537-e311abda1594" },
  { pos: 14, name: "Sidney Nhavira", net: 80, guestId: "d9604e33-d9d8-4b81-9a3e-0a8353feaef7" },
  { pos: 15, name: "Tank Zikwature", net: 80, memberId: "d659496e-cadf-4995-a3fa-0d3501f8cbf9", zgs: false },
  { pos: 16, name: "Ziv Kudenga", net: 80, memberId: "8e36192a-aff7-4f87-b20f-6ed7b2746ab5", zgs: true },
  { pos: 17, name: "Tatenda Chiposi", net: 80, memberId: "ff6a132b-4713-4441-8caf-9c4f6871f458", zgs: true },
  { pos: 18, name: "Itai Chinyadza", net: 80, memberId: "2a7df864-c1a9-41e5-b6d6-64a0c047cf66", zgs: true },
  { pos: 19, name: "Micheal D Handiseni", net: 80, memberId: "b13c38c3-bb27-4843-adaa-3f636ddd23df", zgs: true },
  { pos: 20, name: "Pam Makoni", net: 81, memberId: "2bc0dc8e-b82d-4fb2-9472-d5df2721198c", zgs: true },
  { pos: 21, name: "Noble Chigwedere", net: 81, memberId: "d8bdb9f5-8658-4c9c-a867-c2390915463d", zgs: true },
  { pos: 22, name: "Marshal Konzvo", net: 81, memberId: "0e55d94f-ebd2-4005-8d7f-00b74914afc8", zgs: true },
  { pos: 23, name: "Tawanda Moyo", net: 82, memberId: "d984a051-e43a-4eab-9019-867857ca77fb", zgs: true },
  { pos: 24, name: "Mandela Govera", net: 82, memberId: "ea83c5c4-145e-4264-8169-cc3eac73bd50", zgs: true },
  { pos: 25, name: "Fungai Fundira", net: 82, memberId: "4964fd2c-5025-4d38-998a-31e1f1240812", zgs: true },
  { pos: 26, name: "Fungayi Useya", net: 84, memberId: "ab96a565-c478-456f-9c6b-aa0d709a7066", zgs: false },
  { pos: 27, name: "Isaya Taingwa", net: 85, memberId: "06eda52a-9f0e-42b1-ba85-f11f9e16effa", zgs: false },
  { pos: 28, name: "Phanuel Mtape", net: 85, memberId: "58544f4d-2b4c-4c26-8afa-5a61b52b6016", zgs: true },
  { pos: 29, name: "Don Govere", net: 85, memberId: "96dc9189-07aa-4b98-bfd1-c8af27a55e83", zgs: false },
  { pos: 30, name: "Ian Pinks", net: 86, memberId: "0ccef550-83c2-44c5-9744-d1d542ab393d", zgs: true },
  { pos: 31, name: "Biyi Adegbola", net: 86, unmatched: true },
  { pos: 32, name: "Alf Sagiya", net: 86, memberId: "9ba584a4-6217-4b7d-be0c-7e5b5ffd9e30", zgs: true },
  { pos: 33, name: "Alan Mccarthy", net: 87, memberId: "9f14bce4-2ca5-460a-87ba-925268886163", zgs: false },
  { pos: 34, name: "Terry T D D Manthando", net: 88, memberId: "58b26272-e329-4fa2-bda5-c67f67a25be4", zgs: false },
  { pos: 35, name: "Justin Gapara", net: 88, memberId: "da555301-6105-4c8f-bacc-df56824693d0", zgs: true },
  { pos: 36, name: "Tyno Rudenya", net: 89, memberId: "ac20f649-0fdb-4147-ba0b-7ec00d7f9242", zgs: false },
  { pos: 37, name: "Tafadzwa Mangwiza", net: 89, memberId: "7a991a7e-5ca1-4130-805d-96a0f101706c", zgs: true },
  { pos: 38, name: "Danny Matome", net: 90, memberId: "5b3bbb44-411a-4759-8474-ad7dc2391b2f", zgs: false },
  { pos: 39, name: "Brian Manyanga", net: 90, memberId: "ecdcac18-df83-470a-88f3-db3e9a9eb4cc", zgs: false },
  { pos: 40, name: "Nyasha McCarthy", net: 90, memberId: "05b9df18-94c1-403a-b1f0-fe763a626b4e", zgs: false },
  { pos: 41, name: "Tichafa Muromo", net: 91, memberId: "36a4db22-741a-434a-8cd9-b081e308bd84", zgs: false },
  { pos: 42, name: "Byron Fundira", net: 92, memberId: "123dbe6c-8109-488c-8136-874020646ede", zgs: false },
  { pos: 43, name: "Niyi Olaniyan", net: 93, memberId: "d5356f91-bda4-4126-8327-2fc4262e78b2", zgs: false },
  { pos: 44, name: "Sunday Babalola", net: 93, memberId: "efcc3e83-728f-4d1e-99c9-2cfe03dcb195", zgs: false },
  { pos: 45, name: "Deborah Mohale", net: 97, memberId: "4bc4492d-8e03-4b60-bc09-c0ff4e128d3a", zgs: false },
  { pos: 46, name: "Seane Blobbs Chasi", net: 98, memberId: "42c150cd-bac2-45c9-8098-acb59de887a2", zgs: false },
];

function scoreZgsOom(field) {
  const sorted = [...field].sort((a, b) => a.net - b.net || a.name.localeCompare(b.name));
  let pos = 1;
  let i = 0;
  const positioned = [];
  while (i < sorted.length) {
    const net = sorted[i].net;
    let tie = 1;
    while (i + tie < sorted.length && sorted[i + tie].net === net) tie++;
    for (let j = 0; j < tie; j++) {
      positioned.push({ ...sorted[i + j], fieldPos: pos, zgsOom: 0 });
    }
    pos += tie;
    i += tie;
  }
  const zgsEligible = positioned.filter((p) => p.zgsEligible);
  let rank = 1;
  let mi = 0;
  while (mi < zgsEligible.length) {
    const net = zgsEligible[mi].net;
    let tie = 1;
    while (mi + tie < zgsEligible.length && zgsEligible[mi + tie].net === net) tie++;
    const pts = avgPts(rank, tie);
    for (let j = 0; j < tie; j++) zgsEligible[mi + j].zgsOom = pts;
    rank += tie;
    mi += tie;
  }
  const byName = new Map(positioned.map((p) => [p.name, p]));
  return GAMEBOOK.map((g) => {
    const hit = byName.get(g.name);
    return {
      ...g,
      fieldPos: hit?.fieldPos ?? g.pos,
      zgsOom: g.unmatched ? null : g.guestId ? 0 : g.zgs ? (hit?.zgsOom ?? 0) : 0,
    };
  });
}

function buildField() {
  return GAMEBOOK.filter((g) => !g.unmatched).map((g) => ({
    name: g.name,
    net: g.net,
    zgsEligible: Boolean(g.zgs),
    guest: Boolean(g.guestId),
  }));
}

function rowsToPersist(scored) {
  return scored.filter((g) => !g.unmatched && !g.fieldOnly && (g.zgs || g.guestId));
}

async function main() {
  const unmatched = GAMEBOOK.filter((g) => g.unmatched).map((g) => g.name);
  if (unmatched.length) {
    console.warn("[millbrook] unmatched (skipped):", unmatched);
  }

  const scored = scoreZgsOom(buildField());
  const persist = rowsToPersist(scored);
  console.log("[millbrook] ZGS rows to persist:", persist.length);
  console.table(
    persist.map((r) => ({
      pos: r.pos,
      name: r.name,
      net: r.net,
      oom: r.zgsOom,
      kind: r.guestId ? "guest" : "ZGS member",
    })),
  );

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log("[millbrook] dry-run only (no Supabase env)");
    return;
  }

  const sb = createClient(url, key);
  const { error: delErr } = await sb
    .from("event_results")
    .delete()
    .eq("event_id", EVENT_ID)
    .eq("society_id", ZGS);
  if (delErr) throw delErr;

  const rows = persist.map((r) => ({
    event_id: EVENT_ID,
    society_id: ZGS,
    member_id: r.memberId ?? null,
    event_guest_id: r.guestId ?? null,
    day_value: r.net,
    position: r.pos,
    points: r.zgsOom ?? 0,
  }));

  const { error: insErr } = await sb.from("event_results").insert(rows);
  if (insErr) throw insErr;
  console.log(`[millbrook] inserted ${rows.length} ZGS event_results`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
