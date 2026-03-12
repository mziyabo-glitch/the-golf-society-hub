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
};

export type ApiCourseSearchResult = {
  id: number;
  name: string;
  club_name?: string;
  location?: string;
};

function getGolfApiKey(): string | undefined {
  return (
    process.env.GOLFCOURSE_API_KEY ||
    process.env.GOLF_API_KEY ||
    process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ||
    process.env.EXPO_PUBLIC_GOLF_API_KEY
  );
}

async function request<T>(path: string): Promise<T> {
  const apiKey = getGolfApiKey();
  if (!apiKey) {
    throw new Error("Golf API key missing. Set GOLFCOURSE_API_KEY or GOLF_API_KEY.");
  }

  // GolfCourseAPI: try Bearer first (common for API keys), fallback to Key
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  let res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });

  // Retry with "Key" auth if Bearer returns 401 (some APIs use Key)
  if (res.status === 401 && headers.Authorization?.startsWith("Bearer")) {
    headers.Authorization = `Key ${apiKey}`;
    res = await fetch(`${API_BASE}${path}`, { method: "GET", headers });
  }

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
      throw new Error("GolfCourseAPI: Invalid or missing API key.");
    }
    throw new Error(`GolfCourseAPI error (${res.status}): ${msg}`);
  }

  return res.json() as Promise<T>;
}

export async function searchCourses(query: string): Promise<ApiCourseSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const payload: any = await request(`/search?search_query=${encodeURIComponent(trimmed)}`);
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

export async function getCourseById(id: number): Promise<ApiCourse> {
  const payload: any = await request(`/courses/${id}`);
  const row = payload?.course ?? payload?.data ?? payload;

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
    lat: row.lat ?? row.latitude ?? undefined,
    lng: row.lng ?? row.longitude ?? undefined,
    latitude: row.latitude ?? row.lat ?? undefined,
    longitude: row.longitude ?? row.lng ?? undefined,
    tees,
  };
}
