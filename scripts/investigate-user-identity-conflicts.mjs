import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const emailArg = (process.argv[2] || "e.osewe@gmail.com").trim().toLowerCase();
const nameNeedles = ["Eddie Guda", "Eddie Par"];

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function norm(v) {
  return String(v ?? "").trim().toLowerCase();
}

function hitsName(v) {
  const s = norm(v);
  return nameNeedles.some((n) => s.includes(n.toLowerCase()));
}

async function listAuthUsersByEmailOrName() {
  const rows = [];
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      const e = norm(u.email);
      const full = u.user_metadata?.full_name || u.user_metadata?.name || "";
      if (e === emailArg || hitsName(full)) {
        rows.push({
          id: u.id,
          email: u.email,
          email_confirmed_at: u.email_confirmed_at,
          deleted_at: u.deleted_at ?? null,
          banned_until: u.banned_until ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
          meta_name: full || null,
        });
      }
    }
    if (users.length < 200) break;
    page += 1;
  }
  return rows;
}

async function trySelect(table, select, apply) {
  try {
    let q = sb.from(table).select(select);
    q = apply(q);
    const { data, error } = await q;
    if (error) return { table, error: error.message, data: [] };
    return { table, error: null, data: data ?? [] };
  } catch (e) {
    return { table, error: e?.message || String(e), data: [] };
  }
}

async function main() {
  const authUsers = await listAuthUsersByEmailOrName();
  const authUserIds = [...new Set(authUsers.map((u) => u.id))];

  const profilesByEmail = await trySelect(
    "profiles",
    "id,email,full_name,active_society_id,active_member_id,updated_at",
    (q) => q.ilike("email", emailArg),
  );
  const profilesByName = await trySelect(
    "profiles",
    "id,email,full_name,active_society_id,active_member_id,updated_at",
    (q) => q.or(nameNeedles.map((n) => `full_name.ilike.%${n}%`).join(",")),
  );
  const profilesByAuthIds =
    authUserIds.length > 0
      ? await trySelect("profiles", "id,email,full_name,active_society_id,active_member_id,updated_at", (q) => q.in("id", authUserIds))
      : { table: "profiles(auth ids)", error: null, data: [] };

  const linkedProfileIds = [
    ...new Set([
      ...(profilesByEmail.data || []).map((r) => r.id),
      ...(profilesByName.data || []).map((r) => r.id),
      ...(profilesByAuthIds.data || []).map((r) => r.id),
      ...authUserIds,
    ]),
  ];

  const membersByEmail = await trySelect(
    "members",
    "id,society_id,user_id,name,display_name,email,role,created_at",
    (q) => q.ilike("email", emailArg),
  );
  const membersByName = await trySelect(
    "members",
    "id,society_id,user_id,name,display_name,email,role,created_at",
    (q) => q.or(["name", "display_name"].flatMap((c) => nameNeedles.map((n) => `${c}.ilike.%${n}%`)).join(",")),
  );
  const membersByUserId =
    linkedProfileIds.length > 0
      ? await trySelect("members", "id,society_id,user_id,name,display_name,email,role,created_at", (q) => q.in("user_id", linkedProfileIds))
      : { table: "members(user ids)", error: null, data: [] };

  const memberIds = [
    ...new Set([
      ...(membersByEmail.data || []).map((r) => r.id),
      ...(membersByName.data || []).map((r) => r.id),
      ...(membersByUserId.data || []).map((r) => r.id),
    ]),
  ];

  const userIds = [
    ...new Set([
      ...linkedProfileIds,
      ...(membersByEmail.data || []).map((r) => r.user_id).filter(Boolean),
      ...(membersByName.data || []).map((r) => r.user_id).filter(Boolean),
    ]),
  ];

  const checks = [];
  if (memberIds.length > 0) {
    checks.push(
      await trySelect("event_registrations", "id,event_id,member_id,status,paid,created_at", (q) => q.in("member_id", memberIds)),
      await trySelect("event_entries", "id,event_id,player_id,status,created_at", (q) => q.in("player_id", memberIds)),
      await trySelect("event_guests", "id,event_id,society_id,name,sex,created_at", (q) =>
        q.or(nameNeedles.map((n) => `name.ilike.%${n}%`).join(",")),
      ),
      await trySelect("event_prize_pool_entries", "id,event_id,member_id,wants_to_enter,payment_status,updated_at", (q) => q.in("member_id", memberIds)),
      await trySelect("calendar_feed_tokens", "id,member_id,created_at", (q) => q.in("member_id", memberIds)),
      await trySelect("licence_requests", "id,society_id,requester_member_id,requester_user_id,status,created_at,resolved_at", (q) =>
        q.in("requester_member_id", memberIds),
      ),
      await trySelect("sinbook_participants", "id,sinbook_id,user_id,display_name,created_at", (q) => q.in("user_id", userIds)),
    );
  }
  if (userIds.length > 0) {
    checks.push(
      await trySelect("licence_requests", "id,society_id,requester_member_id,requester_user_id,status,created_at,resolved_at", (q) =>
        q.in("requester_user_id", userIds),
      ),
      await trySelect("sinbook_notifications", "id,user_id,type,is_read,created_at", (q) => q.in("user_id", userIds)),
      await trySelect("sinbook_participants", "id,sinbook_id,user_id,display_name,created_at", (q) => q.in("user_id", userIds)),
    );
  }

  const duplicateLowerProfiles = await trySelect(
    "profiles",
    "id,email,full_name,updated_at",
    (q) => q.not("email", "is", null).order("updated_at", { ascending: false }).limit(20000),
  );
  const duplicateLowerMembers = await trySelect(
    "members",
    "id,user_id,society_id,email,name,created_at",
    (q) => q.not("email", "is", null).order("created_at", { ascending: false }).limit(20000),
  );

  const profDup = {};
  for (const r of duplicateLowerProfiles.data || []) {
    const k = norm(r.email);
    if (!k) continue;
    profDup[k] = profDup[k] || [];
    profDup[k].push(r);
  }
  const memDup = {};
  for (const r of duplicateLowerMembers.data || []) {
    const k = norm(r.email);
    if (!k) continue;
    memDup[k] = memDup[k] || [];
    memDup[k].push(r);
  }

  const report = {
    target: { email: emailArg, names: nameNeedles },
    authUsers,
    profiles: {
      byEmail: profilesByEmail,
      byName: profilesByName,
      byAuthIds: profilesByAuthIds,
    },
    members: {
      byEmail: membersByEmail,
      byName: membersByName,
      byUserId: membersByUserId,
    },
    linkedIds: { userIds, memberIds },
    crossTableChecks: checks,
    duplicateLowerEmail: {
      profiles: Object.fromEntries(Object.entries(profDup).filter(([, v]) => v.length > 1)),
      members: Object.fromEntries(Object.entries(memDup).filter(([, v]) => v.length > 1)),
    },
    derived: {
      singleAuthUserForTarget: authUsers.length === 1,
      singleProfileForTarget:
        ((profilesByEmail.data || []).length + (profilesByName.data || []).length) > 0
          ? [...new Set([...(profilesByEmail.data || []).map((x) => x.id), ...(profilesByName.data || []).map((x) => x.id)])].length === 1
          : false,
      activeMemberRowsForLinkedUsers:
        [...new Set((membersByUserId.data || []).map((r) => r.id))].length,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("[investigate-user-identity-conflicts] fatal:", e?.message || String(e));
  process.exit(1);
});

