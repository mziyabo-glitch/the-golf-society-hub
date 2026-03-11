const API_BASE = "https://api.golfcourseapi.com/v1";

export type ApiHole = {
  hole_number?: number;
  number?: number;
  par?: number;
  yardage?: number;
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
  tees?: ApiTee[];
};

export type ApiCourseSearchResult = {
  id: number;
  name: string;
  club_name?: string;
  location?: string;
};

function getGolfApiKey(): string | undefined {
  return process.env.GOLF_API_KEY || process.env.EXPO_PUBLIC_GOLF_API_KEY;
}

async function request<T>(path: string): Promise<T> {
  const apiKey = getGolfApiKey();
  if (!apiKey) {
    throw new Error("Golf API key missing. Set GOLF_API_KEY.");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Key ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    throw new Error("GolfCourseAPI rate limit reached. Please try again shortly.");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GolfCourseAPI error (${res.status}): ${text || "Unknown error"}`);
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

  return list
    .map((row) => ({
      id: Number(row.id),
      name: row.name || row.course_name || "",
      club_name: row.club_name || row.club || undefined,
      location: row.location || row.region || row.country || undefined,
    }))
    .filter((row) => Number.isFinite(row.id) && !!row.name);
}

export async function getCourseById(id: number): Promise<ApiCourse> {
  const payload: any = await request(`/courses/${id}`);
  const row = payload?.course ?? payload?.data ?? payload;

  return {
    id: Number(row.id),
    name: row.name || row.course_name || "Unknown course",
    club_name: row.club_name || row.club || undefined,
    lat: row.lat ?? row.latitude ?? undefined,
    lng: row.lng ?? row.longitude ?? undefined,
    latitude: row.latitude ?? row.lat ?? undefined,
    longitude: row.longitude ?? row.lng ?? undefined,
    tees: Array.isArray(row.tees) ? row.tees : [],
  };
}
