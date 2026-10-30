/**
 * Course contact + deep links (tel, web, maps, share text).
 */

import { supabase } from "@/lib/supabase";
import type { CourseLocationRow } from "@/lib/db_supabase/courseRepo";

export type CourseContactBundle = {
  courseName: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  websiteUrl: string | null;
  /** GolfCourseAPI course id when known */
  apiCourseId?: number | null;
};

export async function enrichCourseContact(row: CourseLocationRow | null, fallbackName: string): Promise<CourseContactBundle> {
  const courseName = row?.course_name?.trim() || fallbackName;
  let websiteUrl = row?.website_url?.trim() || null;
  let phone = row?.phone?.trim() || null;

  if (row?.id && !websiteUrl) {
    try {
      const { data } = await supabase
        .from("course_domains")
        .select("homepage_url, domain")
        .eq("course_id", row.id)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();
      const u = data?.homepage_url || data?.domain;
      if (typeof u === "string" && u.trim()) {
        websiteUrl = u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`;
      }
    } catch {
      // optional table
    }
  }

  return {
    courseName,
    lat: row?.lat ?? null,
    lng: row?.lng ?? null,
    phone: phone || null,
    websiteUrl: websiteUrl || null,
    apiCourseId: row?.api_id ?? null,
  };
}

export function buildMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function buildTelUrl(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return "";
  return `tel:${digits}`;
}

export function buildPlayabilityShareLines(
  courseName: string,
  eventDate: string | undefined,
  insightSummary: string,
  rating: number,
  bestWindow: string | null,
  bestWindowFallback?: string | null,
): string {
  const windowLine = bestWindow
    ? `Suggested window: ${bestWindow}`
    : bestWindowFallback
      ? bestWindowFallback
      : null;
  const lines = [
    `⛳ ${courseName}`,
    eventDate ? `Round: ${eventDate}` : null,
    `Playability: ${rating.toFixed(1)}/10 — ${insightSummary}`,
    windowLine,
    "",
    "Shared from The Golf Society Hub",
  ];
  return lines.filter(Boolean).join("\n");
}
