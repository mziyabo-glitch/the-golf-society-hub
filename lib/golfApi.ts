import { GOLF_API_KEY } from "@/lib/env";

const API_BASE = "https://api.golfcourseapi.com/v1";

export type ApiHole = {
  hole_number?: number;
  number?: number;
  par?: number;
  yardage?: number;
  handicap?: number;
  stroke_index?: number;
  hcp?: number;
};

export type ApiTee = {
  id?: number | string;
  name?: string;
  tee_name?: string;
  course_rating?: number;
  slope_rating?: number;
  par_total?: number;
  total_yards?: number;
  yards?: number;
  gender?: "M" | "F" | "male" | "female";
  holes?: ApiHole[];
};

export type ApiCourse = {
  id: number;
  name: string;
  club_name?: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  tees?: {
    male?: ApiTee[];
    female?: ApiTee[];
  } | ApiTee[];
  /** Raw API response object for courses.raw_row (NOT NULL). */
  raw_row?: unknown;
};

export type ApiCourseSearchResult = {
  id: number;
  name: string;
  club_name?: string;
  location?: string;
};

async function request<T>(path: string): Promise<T> {
  if (!GOLF_API_KEY) {
    throw new Error("Golf API authentication failed.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Key ${GOLF_API_KEY}`,
  };

  const res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });

  if (res.status === 429) {
    throw new Error("GolfCourseAPI rate limit reached. Please try again shortly.");
  }

  if (!res.ok) {
    const text = await res.text();
    const msg = text || "Unknown error";
    console.error("[golfApi] Request failed:", res.status, path, msg);
    if (res.status === 400) {
      throw new Error(`GolfCourseAPI 400: ${msg}. Check API key (GOLFCOURSE_API_KEY) and endpoint.`);
    }
    if (res.status === 401) {
      console.error("GolfCourseAPI authorization failed. Check API key format.");
      throw new Error("Golf API authentication failed.");
    }
    throw new Error(`GolfCourseAPI error (${res.status}): ${msg}`);
  }

  return res.json() as Promise<T>;
}

function parseSearchPayload(payload: any): ApiCourseSearchResult[] {
  const list: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.courses)
      ? payload.courses
      : Array.isArray(payload?.data)
        ? payload.data
        : [];

  const toLocationString = (v: unknown): string | undefined => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const parts = [o.address, o.city, o.region, o.country].filter(
        (x) => typeof x === "string" && (x as string).trim()
      ) as string[];
      return parts.length > 0 ? parts.join(", ") : undefined;
    }
    return undefined;
  };

  return list
    .map((row) => {
      const loc =
        toLocationString(row.location) ||
        toLocationString(row.region) ||
        toLocationString(row.country);
      return {
        id: Number(row.id),
        name: row.name || row.course_name || "",
        club_name: row.club_name || row.club || undefined,
        location: loc,
      };
    })
    .filter((row) => Number.isFinite(row.id) && !!row.name);
}

export async function searchCourses(query: string): Promise<ApiCourseSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (typeof window !== "undefined") {
    try {
      const res = await fetch(`/api/golf/search?q=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Search failed (${res.status})`);
      }
      const payload = await res.json();
      return parseSearchPayload(payload);
    } catch (e: any) {
      throw e;
    }
  }

  if (!GOLF_API_KEY) {
    console.warn("Skipping GolfCourseAPI request: key missing");
    return [];
  }

  const payload: any = await request(`/search?search_query=${encodeURIComponent(trimmed)}`);
  return parseSearchPayload(payload);
}

function extractCourseRow(payload: any): any {
  const course = payload?.courses?.[0] ?? payload?.course ?? payload?.data ?? payload;
  return course;
}

export async function getCourseById(id: number): Promise<ApiCourse> {
  const url = typeof window !== "undefined" ? `/api/golf/course/${id}` : `https://api.golfcourseapi.com/v1/courses/${id}`;
  console.log("[golfApi] getCourseById:", { id, url });

  let payload: any;

  if (typeof window !== "undefined") {
    const res = await fetch(`/api/golf/course/${id}`);
    const bodyText = await res.text();
    let errData: any;
    try {
      errData = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      errData = { error: bodyText?.slice(0, 200) };
    }
    if (!res.ok) {
      console.error("[golfApi] getCourseById failed:", {
        status: res.status,
        courseId: id,
        error: errData?.error,
        bodyPreview: bodyText?.slice(0, 300),
      });
      throw new Error(errData?.error || `Failed to fetch course (${res.status})`);
    }
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      throw new Error("Invalid JSON response from course API");
    }
  } else {
    payload = await request(`/courses/${id}`);
  }

  const row = extractCourseRow(payload);
  console.log("[golfApi] getCourseById raw API row:", JSON.stringify(row, null, 2).slice(0, 2000));

  const { lat, lng } = extractCoordinates(row);

  // Parse tees: API returns { male: [...], female: [...] } or flat array
  let tees: ApiTee[] | { male: ApiTee[]; female: ApiTee[] };
  if (Array.isArray(row.tees)) {
    tees = row.tees.map((t: any) => ({
      ...t,
      total_yards: t.total_yards ?? t.yards ?? t.yardage,
    }));
  } else {
    const male = (row?.tees?.male ?? []).map((t: any) => ({
      ...t,
      gender: "M" as const,
      total_yards: t.total_yards ?? t.yards ?? t.yardage,
    }));
    const female = (row?.tees?.female ?? []).map((t: any) => ({
      ...t,
      gender: "F" as const,
      total_yards: t.total_yards ?? t.yards ?? t.yardage,
    }));
    tees = { male, female };
  }

  return {
    id: Number(row.id),
    name: row.name || row.course_name || "Unknown course",
    club_name: row.club_name || row.club || undefined,
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    tees,
    raw_row: row,
  };
}

/**
 * Extract coordinates from API response. Handles all supported shapes:
 * - row.lat, row.lng
 * - row.latitude, row.longitude
 * - row.location.latitude, row.location.longitude
 * - row.coordinates.lat, row.coordinates.lng
 * - row.coordinates.latitude, row.coordinates.longitude
 * - row.geo.lat, row.geo.lng
 * Returns undefined for missing/invalid values.
 */
function extractCoordinates(row: any): { lat?: number; lng?: number } {
  const toNum = (v: unknown): number | undefined => {
    if (v == null) return undefined;
    const n = typeof v === "string" ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const lat =
    toNum(row?.lat) ??
    toNum(row?.latitude) ??
    toNum(row?.location?.latitude) ??
    toNum(row?.location?.lat) ??
    toNum(row?.coordinates?.latitude) ??
    toNum(row?.coordinates?.lat) ??
    toNum(row?.geo?.lat) ??
    toNum(row?.geo?.latitude);

  const lng =
    toNum(row?.lng) ??
    toNum(row?.longitude) ??
    toNum(row?.location?.longitude) ??
    toNum(row?.location?.lng) ??
    toNum(row?.coordinates?.longitude) ??
    toNum(row?.coordinates?.lng) ??
    toNum(row?.geo?.lng) ??
    toNum(row?.geo?.longitude);

  return { lat, lng };
}
