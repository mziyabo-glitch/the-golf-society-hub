import * as Crypto from "expo-crypto";
import { supabase } from "@/lib/supabase";

/** 64-char hex (128-bit effective display); URL-safe and avoids btoa/Buffer on RN. */
function bytesToOpaqueToken(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function newOpaqueToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return bytesToOpaqueToken(bytes);
}

async function getAuthedUid(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

/**
 * Returns stable secret token for this user + society (creates row on first use).
 * Uses table + RLS (no RPC) so it works even when PostgREST does not expose `ensure_calendar_feed_token`.
 */
export async function ensureCalendarFeedToken(societyId: string, memberId: string): Promise<string> {
  const uid = await getAuthedUid();
  if (!memberId?.trim()) throw new Error("Missing member id for this society");

  const { data: existing, error: selErr } = await supabase
    .from("calendar_feed_tokens")
    .select("token")
    .eq("user_id", uid)
    .eq("society_id", societyId)
    .maybeSingle();

  if (selErr) throw selErr;
  const existingToken =
    existing && typeof (existing as { token?: string }).token === "string"
      ? (existing as { token: string }).token.trim()
      : "";
  if (existingToken) return existingToken;

  const token = await newOpaqueToken();
  const { error: insErr } = await supabase.from("calendar_feed_tokens").insert({
    token,
    user_id: uid,
    society_id: societyId,
    member_id: memberId,
  });

  if (insErr) {
    if (insErr.code === "23505" || /duplicate key/i.test(insErr.message ?? "")) {
      const { data: again, error: againErr } = await supabase
        .from("calendar_feed_tokens")
        .select("token")
        .eq("user_id", uid)
        .eq("society_id", societyId)
        .maybeSingle();
      if (againErr) throw againErr;
      const t =
        again && typeof (again as { token?: string }).token === "string"
          ? (again as { token: string }).token.trim()
          : "";
      if (t) return t;
    }
    throw insErr;
  }

  return token;
}

/**
 * New secret token; previous /api/calendar/{old}.ics URLs stop working immediately.
 * Implemented as delete + insert under RLS (no RPC).
 */
export async function rotateCalendarFeedToken(societyId: string, memberId: string): Promise<string> {
  const uid = await getAuthedUid();
  if (!memberId?.trim()) throw new Error("Missing member id for this society");

  const { error: delErr } = await supabase
    .from("calendar_feed_tokens")
    .delete()
    .eq("user_id", uid)
    .eq("society_id", societyId);

  if (delErr) throw delErr;

  return ensureCalendarFeedToken(societyId, memberId);
}
