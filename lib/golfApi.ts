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
  tees?:
    | {
        male?: ApiTee[];
        female?: ApiTee[];
        men?: ApiTee[];
        women?: ApiTee[];
        ladies?: ApiTee[];
      }
    | ApiTee[];
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

function getApiBase(): string {
  if (typeof window === "undefined" || !window.location) return "";
  const { hostname, port } = window.location;
  if (hostname === "localhost" && (port === "8081" || port === "19006")) return "http://localhost:3001";
  return "";
}

export async function searchCourses(query: string): Promise<ApiCourseSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (typeof window !== "undefined") {
    try {
      const base = getApiBase();
      const res = await fetch(`${base}/api/golf/search?q=${encodeURIComponent(trimmed)}`);
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
    const base = getApiBase();
    const res = await fetch(`${base}/api/golf/course/${id}`);
    const body = await res.text();
    if (!res.ok) {
      let err: any = {};
      try {
        err = body ? JSON.parse(body) : {};
      } catch {
        err = { error: body?.slice(0, 200) };
      }
      console.error("[golfApi] getCourseById failed:", { url, status: res.status, body: body?.slice(0, 500) });
      throw new Error(err?.error || `Failed to fetch course (${res.status})`);
    }
    try {
      payload = body ? JSON.parse(body) : {};
    } catch {
      payload = {};
    }
  } else {
    payload = await request(`/courses/${id}`);
  }

  const row = extractCourseRow(payload);
  console.log("[golfApi] getCourseById raw API row:", JSON.stringify(row, null, 2).slice(0, 2000));

  // Parse tees: API returns { male: [...], female: [...] } or flat array
  // Support alternate keys: men/women, ladies (for female)
  let tees: ApiTee[] | { male: ApiTee[]; female: ApiTee[] };
  if (Array.isArray(row.tees)) {
    tees = row.tees.map((t: any) => ({
      ...t,
      total_yards: t.total_yards ?? t.yards ?? t.yardage,
    }));
  } else {
    const maleRaw = row?.tees?.male ?? row?.tees?.men ?? [];
    const femaleRaw = row?.tees?.female ?? row?.tees?.women ?? row?.tees?.ladies ?? [];
    const male = (Array.isArray(maleRaw) ? maleRaw : []).map((t: any) => ({
      ...t,
      gender: "M" as const,
      total_yards: t.total_yards ?? t.yards ?? t.yardage,
    }));
    const female = (Array.isArray(femaleRaw) ? femaleRaw : []).map((t: any) => ({
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
    lat: row.lat ?? row.latitude ?? undefined,
    lng: row.lng ?? row.longitude ?? undefined,
    latitude: row.latitude ?? row.lat ?? undefined,
    longitude: row.longitude ?? row.lng ?? undefined,
    tees,
  };
}
