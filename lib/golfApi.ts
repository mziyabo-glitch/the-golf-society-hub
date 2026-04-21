/**
 * GolfCourseAPI HTTP client (importer / enrichment only — not runtime gameplay source of truth).
 *
 * Env: `EXPO_PUBLIC_GOLFCOURSE_API_KEY`, `GOLFCOURSE_API_KEY`, `EXPO_PUBLIC_GOLF_API_KEY`, `NEXT_PUBLIC_GOLF_API_KEY`
 * (see `lib/env.ts`). Header: `Authorization: Key <key>`.
 *
 * Web dev: requests go via `npm run dev:api` proxy when origin is localhost:8081|19006.
 */

import { GOLF_API_KEY } from "@/lib/env";
import { getCache, setCache } from "@/lib/cache/clientCache";
import type {
  GolfCourseApiCourse,
  GolfCourseApiHole,
  GolfCourseApiSearchHit,
  GolfCourseApiSearchResponse,
  GolfCourseApiTee,
} from "@/types/course";

export type { GolfCourseApiCourse, GolfCourseApiHole, GolfCourseApiTee } from "@/types/course";

const API_BASE = "https://api.golfcourseapi.com/v1";
const SEARCH_CACHE_PREFIX = "gca:search:";
const SEARCH_TTL_MS = 90_000;

/** @deprecated Prefer `GolfCourseApiCourse` */
export type ApiCourse = GolfCourseApiCourse;
/** @deprecated Prefer `GolfCourseApiTee` */
export type ApiTee = GolfCourseApiTee;
/** @deprecated Prefer `GolfCourseApiHole` */
export type ApiHole = GolfCourseApiHole;

export type ApiCourseSearchResult = {
  id: number;
  name: string;
  club_name?: string;
  location?: string;
};

const inflightCourseDetail = new Map<number, Promise<GolfCourseApiCourse>>();

export function getGolfCourseApiKey(): string {
  return GOLF_API_KEY?.trim() ?? "";
}

export function assertGolfCourseApiKeyConfigured(): void {
  if (!getGolfCourseApiKey()) {
    throw new Error(
      "GolfCourseAPI key is not configured. Set EXPO_PUBLIC_GOLFCOURSE_API_KEY or EXPO_PUBLIC_GOLF_API_KEY (see lib/env.ts).",
    );
  }
}

function getApiBase(): string {
  if (typeof window === "undefined" || !window.location) return "";
  const { hostname, port } = window.location;
  if (hostname === "localhost" && (port === "8081" || port === "19006")) return "http://localhost:3001";
  return "";
}

async function safeReadJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text?.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`GolfCourseAPI returned non-JSON body (HTTP ${res.status}). First bytes: ${text.slice(0, 120)}`);
  }
}

/**
 * Low-level GET against GolfCourseAPI (native / server). Not used from web browser (CORS) — use proxy there.
 */
export async function golfCourseApiGetJson(path: string): Promise<unknown> {
  assertGolfCourseApiKeyConfigured();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Key ${getGolfCourseApiKey()}`,
  };
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (__DEV__) console.log("[golfApi] GET", url);
  const res = await fetch(url, { method: "GET", headers });

  if (res.status === 429) {
    throw new Error("GolfCourseAPI rate limit reached. Please try again shortly.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = text || "Unknown error";
    if (__DEV__) console.error("[golfApi] HTTP error", res.status, path, msg.slice(0, 400));
    if (res.status === 400) {
      throw new Error(`GolfCourseAPI 400: ${msg.slice(0, 280)}. Check query and API key.`);
    }
    if (res.status === 401) {
      throw new Error("GolfCourseAPI authentication failed (401). Check Authorization: Key <API_KEY> format.");
    }
    throw new Error(`GolfCourseAPI error (${res.status}): ${msg.slice(0, 280)}`);
  }
  return safeReadJson(res);
}

function extractSearchList(payload: GolfCourseApiSearchResponse): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.courses)) return o.courses;
    if (Array.isArray(o.data)) return o.data;
    if (Array.isArray(o.results)) return o.results;
  }
  return [];
}

function locationStringFromHit(row: Record<string, unknown>): string | undefined {
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const direct = pick(row.location);
  if (direct) return direct;
  const loc = row.location;
  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const o = loc as Record<string, unknown>;
    const parts = [o.address, o.city, o.region, o.country].filter(
      (x) => typeof x === "string" && (x as string).trim(),
    ) as string[];
    if (parts.length) return parts.join(", ");
  }
  return pick(row.city) || pick(row.country) || pick(row.region);
}

export function parseSearchResponse(payload: GolfCourseApiSearchResponse): GolfCourseApiSearchHit[] {
  const list = extractSearchList(payload);
  return list
    .map((row) => {
      const r = row as Record<string, unknown>;
      const id = Number(r.id);
      const name = (typeof r.name === "string" && r.name.trim()
        ? r.name
        : typeof r.course_name === "string" && r.course_name.trim()
          ? r.course_name
          : "") as string;
      const club_name =
        (typeof r.club_name === "string" && r.club_name.trim()
          ? r.club_name
          : typeof r.club === "string" && r.club.trim()
            ? r.club
            : undefined) as string | undefined;
      return {
        id,
        name,
        course_name: typeof r.course_name === "string" ? r.course_name : undefined,
        club_name,
        location: locationStringFromHit(r),
      } as GolfCourseApiSearchHit;
    })
    .filter((row) => Number.isFinite(row.id) && (row as GolfCourseApiSearchHit).id > 0 && !!(row as GolfCourseApiSearchHit).name);
}

/**
 * Search courses (typed). Web uses local proxy; native calls API directly with cache.
 */
export async function searchCourses(query: string): Promise<ApiCourseSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (typeof window !== "undefined") {
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/api/golf/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const err = (await safeReadJson(res).catch(() => ({}))) as { error?: string };
        throw new Error(typeof err?.error === "string" ? err.error : `Search failed (${res.status})`);
      }
      const payload = (await safeReadJson(res)) as GolfCourseApiSearchResponse;
      return parseSearchResponse(payload).map((h) => ({
        id: h.id,
        name: h.name || h.course_name || "",
        club_name: h.club_name,
        location: typeof h.location === "string" ? h.location : undefined,
      }));
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  if (!getGolfCourseApiKey()) {
    if (__DEV__) console.warn("[golfApi] searchCourses: API key missing, returning []");
    return [];
  }

  const cacheKey = `${SEARCH_CACHE_PREFIX}${trimmed.toLowerCase()}`;
  const cached = await getCache<ApiCourseSearchResult[]>(cacheKey, { maxAgeMs: SEARCH_TTL_MS });
  if (cached?.value?.length) {
    if (__DEV__) console.log("[golfApi] searchCourses cache hit", trimmed);
    return cached.value;
  }

  const payload = (await golfCourseApiGetJson(
    `/search?search_query=${encodeURIComponent(trimmed)}`,
  )) as GolfCourseApiSearchResponse;
  const parsed = parseSearchResponse(payload).map((h) => ({
    id: h.id,
    name: h.name || h.course_name || "",
    club_name: h.club_name,
    location: typeof h.location === "string" ? h.location : undefined,
  }));
  await setCache(cacheKey, parsed, { ttlMs: SEARCH_TTL_MS });
  return parsed;
}

function extractCourseRow(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const o = payload as Record<string, unknown>;
  const nested =
    (Array.isArray(o.courses) ? (o.courses[0] as unknown) : null) ??
    o.course ??
    o.data ??
    payload;
  return typeof nested === "object" && nested !== null ? (nested as Record<string, unknown>) : {};
}

function coerceCourseFromRow(row: Record<string, unknown>): GolfCourseApiCourse {
  const id = Number(row.id);
  const teesRaw = row.tees;
  let tees: GolfCourseApiCourse["tees"];
  if (Array.isArray(teesRaw)) {
    tees = teesRaw.map((t) => {
      const x = t as Record<string, unknown>;
      return {
        ...x,
        total_yards: x.total_yards ?? x.yards ?? x.yardage,
      } as GolfCourseApiTee;
    });
  } else if (teesRaw && typeof teesRaw === "object") {
    const t = teesRaw as Record<string, unknown>;
    const mapList = (arr: unknown, gender: string) =>
      (Array.isArray(arr) ? arr : []).map((item) => ({
        ...(item as Record<string, unknown>),
        gender,
        total_yards:
          (item as Record<string, unknown>).total_yards ??
          (item as Record<string, unknown>).yards ??
          (item as Record<string, unknown>).yardage,
      }));
    tees = {
      male: mapList(t.male ?? t.men, "M") as GolfCourseApiTee[],
      female: mapList(t.female ?? t.women ?? t.ladies, "F") as GolfCourseApiTee[],
    };
  } else {
    tees = undefined;
  }

  return {
    id: Number.isFinite(id) ? id : NaN,
    name: (row.name || row.course_name) as string | undefined,
    course_name: row.course_name as string | undefined,
    club_name: (row.club_name || row.club) as string | undefined,
    club: row.club as string | undefined,
    lat: safeNum(row.lat ?? row.latitude),
    lng: safeNum(row.lng ?? row.longitude),
    latitude: safeNum(row.latitude ?? row.lat),
    longitude: safeNum(row.longitude ?? row.lng),
    address: row.address as GolfCourseApiCourse["address"],
    city: row.city as string | undefined,
    country: row.country as string | undefined,
    location: row.location as GolfCourseApiCourse["location"],
    tees,
  };
}

function safeNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /courses/{id} — typed course payload. Web: dev proxy. Native: direct API + in-flight dedupe.
 */
export async function getCourseById(id: number): Promise<GolfCourseApiCourse> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("getCourseById: invalid course id");
  }

  const run = async (): Promise<GolfCourseApiCourse> => {
    if (typeof window !== "undefined") {
      const base = getApiBase();
      const res = await fetch(`${base}/api/golf/course/${id}`);
      const bodyText = await res.text();
      if (!res.ok) {
        let err: { error?: string } = {};
        try {
          err = bodyText ? (JSON.parse(bodyText) as { error?: string }) : {};
        } catch {
          err = { error: bodyText?.slice(0, 200) };
        }
        if (__DEV__) console.error("[golfApi] getCourseById proxy failed", res.status, err);
        throw new Error(err?.error || `Failed to fetch course (${res.status})`);
      }
      let payload: unknown = {};
      try {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        throw new Error("Golf course proxy returned invalid JSON.");
      }
      const row = extractCourseRow(payload);
      const course = coerceCourseFromRow(row);
      if (!Number.isFinite(course.id) || course.id <= 0) {
        throw new Error("GolfCourseAPI course payload missing valid id.");
      }
      if (__DEV__) console.log("[golfApi] getCourseById (web) raw slice:", JSON.stringify(row).slice(0, 1800));
      return course;
    }

    assertGolfCourseApiKeyConfigured();
    const payload = await golfCourseApiGetJson(`/courses/${id}`);
    const row = extractCourseRow(payload);
    if (__DEV__) console.log("[golfApi] getCourseById (native) raw slice:", JSON.stringify(row).slice(0, 1800));
    const course = coerceCourseFromRow(row);
    if (!Number.isFinite(course.id) || course.id <= 0) {
      throw new Error("GolfCourseAPI course payload missing valid id.");
    }
    return course;
  };

  if (typeof window === "undefined") {
    const existing = inflightCourseDetail.get(id);
    if (existing) return existing;
    const p = run().finally(() => {
      inflightCourseDetail.delete(id);
    });
    inflightCourseDetail.set(id, p);
    return p;
  }

  return run();
}
