// Course and course_tees for event setup (search course → select tee)
import { supabase } from "@/lib/supabase";
import { isValidUuid } from "@/lib/uuid";

export type CourseTee = {
  id: string;
  course_id: string;
  tee_name: string;
  tee_color?: string | null;
  course_rating: number;
  slope_rating: number;
  par_total: number;
  gender?: string | null;
  yards?: number | null;
};

export type CourseSearchHit = {
  id: string;
  name: string;
  location?: string | null;
};

/**
 * Fetch tees for a course (from course_tees table).
 * Gracefully handles table-not-found (migration 048 not applied).
 * Returns [] if courseId is not a valid UUID (avoids "invalid input syntax for type uuid").
 */
export async function getTeesByCourseId(courseId: string): Promise<CourseTee[]> {
  if (!isValidUuid(courseId)) {
    console.warn("[courseRepo] Skipping tee lookup: invalid courseId", { courseId: courseId || "(empty)" });
    return [];
  }

  const { data, error } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", courseId)
    .order("tee_name");

  if (error) {
    console.error("[courseRepo] getTeesByCourseId failed:", error.message, error.code, error.details);
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      console.warn("[courseRepo] course_tees table does not exist — run migration 048");
      return [];
    }
    throw new Error(error.message || "Failed to load tees");
  }

  const tees = (data ?? []).map((row: any) => {
    const cr = row.course_rating;
    const sr = row.slope_rating;
    const pt = row.par_total;
    return {
      id: row.id,
      course_id: row.course_id,
      tee_name: row.tee_name ?? "",
      tee_color: row.tee_color ?? null,
      course_rating: cr != null && Number.isFinite(Number(cr)) ? Number(cr) : 0,
      slope_rating: sr != null && Number.isFinite(Number(sr)) ? Number(sr) : 0,
      par_total: pt != null && Number.isFinite(Number(pt)) ? Number(pt) : 0,
      gender: row.gender ?? null,
      yards: row.yards ?? null,
    };
  });

  console.log("[courseRepo] getTeesByCourseId returned", tees.length, "tees");
  return tees;
}

export type TeeSource = "imported" | "local-manual" | "event-saved";

export type CourseTeeWithSource = CourseTee & { _source?: TeeSource };

/**
 * Merge tee options from multiple sources for full selector coverage.
 * - Local course_tees (imported or manually added to DB)
 * - Event-saved tee names (tee_name, ladies_tee_name) if not already in list
 * - Optionally tees from other course records with same normalized name (duplicate course handling)
 * Dedupes by tee_name (case-insensitive).
 */
export async function getTeesForCourseWithMerge(
  courseId: string,
  options?: {
    eventTeeNames?: { male?: string; female?: string };
    eventTeeValues?: {
      male?: { par?: number; courseRating?: number; slopeRating?: number };
      female?: { par?: number; courseRating?: number; slopeRating?: number };
    };
    courseName?: string;
    includeOtherCourseTees?: boolean;
  }
): Promise<CourseTeeWithSource[]> {
  if (!isValidUuid(courseId)) {
    console.warn("[courseRepo] getTeesForCourseWithMerge: invalid courseId");
    return [];
  }

  const localTees = await getTeesByCourseId(courseId);
  const seen = new Set<string>();
  const result: CourseTeeWithSource[] = [];

  for (const t of localTees) {
    const key = (t.tee_name || "").toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push({ ...t, _source: "imported" as TeeSource });
    }
  }

  if (__DEV__ && options?.courseName) {
    const courseNameLower = (options.courseName || "").toLowerCase();
    const isShrivenham = courseNameLower.includes("shrivenham");
    if (isShrivenham) {
      const { data: blueInCourseTees } = await supabase
        .from("course_tees")
        .select("id, course_id, tee_name")
        .ilike("tee_name", "%blue%");
      const { data: allShrivenhamCourses } = await supabase
        .from("courses")
        .select("id, course_name, api_id")
        .ilike("course_name", "%shrivenham%");
      console.log("[courseRepo] TEE INVESTIGATION (Shrivenham):", {
        currentCourseId: courseId,
        localTeeNames: localTees.map((t) => t.tee_name),
        hasBlueInLocal: localTees.some((t) => (t.tee_name || "").toLowerCase().includes("blue")),
        blueInCourseTees: blueInCourseTees ?? [],
        allShrivenhamCourseIds: (allShrivenhamCourses ?? []).map((c) => ({ id: c.id, name: c.course_name })),
        eventTeeNames: options?.eventTeeNames,
      });
    }
  }

  const maleName = (options?.eventTeeNames?.male ?? "").trim();
  const femaleName = (options?.eventTeeNames?.female ?? "").trim();
  const namesToAdd = [maleName, femaleName].filter((n) => n && !seen.has(n.toLowerCase()));

  for (const name of namesToAdd) {
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const isMale = name === maleName;
    const vals = isMale ? options?.eventTeeValues?.male : options?.eventTeeValues?.female;
    result.push({
      id: `event-saved-${key}`,
      course_id: courseId,
      tee_name: name,
      tee_color: null,
      course_rating: vals?.courseRating ?? 0,
      slope_rating: vals?.slopeRating ?? 0,
      par_total: vals?.par ?? 0,
      gender: isMale ? "M" : "F",
      yards: null,
      _source: "event-saved",
    });
    if (__DEV__) {
      console.log("[courseRepo] tee option source: event-saved", { tee_name: name });
    }
  }

  if (options?.includeOtherCourseTees && options?.courseName) {
    const name = (options.courseName || "").trim();
    const searchTerm = name.length >= 4 ? name.split(/\s+/)[0] : "";
    if (searchTerm) {
      const { data: otherCourses } = await supabase
        .from("courses")
        .select("id, course_name")
        .neq("id", courseId)
        .ilike("course_name", `%${searchTerm}%`);
      for (const c of otherCourses ?? []) {
        const otherTees = await getTeesByCourseId(c.id);
        for (const t of otherTees) {
          const key = (t.tee_name || "").toLowerCase().trim();
          if (key && !seen.has(key)) {
            seen.add(key);
            result.push({ ...t, _source: "local-manual" as TeeSource });
            if (__DEV__) {
              console.log("[courseRepo] tee option source: local-manual (other course)", {
                tee_name: t.tee_name,
                otherCourseId: c.id,
                otherCourseName: c.course_name,
              });
            }
          }
        }
      }
    }
  }

  result.sort((a, b) => (a.tee_name || "").localeCompare(b.tee_name || ""));
  if (__DEV__) {
    console.log("[courseRepo] getTeesForCourseWithMerge final:", {
      total: result.length,
      names: result.map((t) => t.tee_name),
      sources: result.map((t) => (t as CourseTeeWithSource)._source),
    });
  }
  return result;
}
export type SearchCoursesResult = {
  data: CourseSearchHit[];
  error: string | null;
};

export type CourseWithTees = {
  courseId: string;
  courseName: string;
  tees: CourseTee[];
  fromCache: boolean;
};

/**
 * Get course + tees from DB by GolfCourseAPI id (api_id).
 * Returns null if course not found or has 0 tees (so caller fetches from API).
 */
export async function getCourseByApiId(apiId: number): Promise<CourseWithTees | null> {
  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, course_name")
    .eq("api_id", apiId)
    .maybeSingle();

  if (courseErr || !course) return null;
  if (!isValidUuid(course.id)) {
    console.warn("[courseRepo] getCourseByApiId: course.id is not valid UUID, skipping tee lookup");
    return null;
  }

  const tees = await getTeesByCourseId(course.id);
  if (tees.length === 0) {
    console.log("[courseRepo] getCourseByApiId: course exists but 0 tees, returning null to trigger API fetch");
    return null;
  }
  return {
    courseId: course.id,
    courseName: course.course_name ?? course.name ?? "",
    tees,
    fromCache: true,
  };
}

export type ApiTeeInput = {
  tee_name?: string;
  name?: string;
  course_rating?: number;
  slope_rating?: number;
  par_total?: number;
  par?: number;
  total_yards?: number;
  yards?: number;
  gender?: string;
};

/**
 * Upsert tees from API response into course_tees.
 * Prevents duplicates by checking (course_id, tee_name).
 * Call getTeesByCourseId after to reload.
 */
export async function upsertTeesFromApi(
  courseId: string,
  apiTees: ApiTeeInput[] | { male?: ApiTeeInput[]; female?: ApiTeeInput[] }
): Promise<CourseTee[]> {
  if (!isValidUuid(courseId)) {
    console.warn("[courseRepo] Skipping tee upsert: invalid courseId", { courseId: courseId || "(empty)" });
    return [];
  }

  const flat: ApiTeeInput[] = Array.isArray(apiTees)
    ? apiTees
    : [
        ...(apiTees?.male ?? []).map((t) => ({ ...t, gender: "M" })),
        ...(apiTees?.female ?? []).map((t) => ({ ...t, gender: "F" })),
      ];

  if (flat.length === 0) return getTeesByCourseId(courseId);

  const rows = flat
    .map((t) => {
      const teeName = (t.tee_name || t.name || "").trim();
      if (!teeName) return null;
      const yards = t.total_yards ?? t.yards;
      const slope = t.slope_rating;
      const courseRating = t.course_rating;
      const parVal = t.par_total ?? t.par;
      const cr = courseRating != null && Number.isFinite(Number(courseRating)) ? Number(courseRating) : null;
      const sr = slope != null && Number.isFinite(Number(slope)) ? Math.round(Number(slope)) : null;
      const pt = parVal != null && Number.isFinite(Number(parVal)) ? Math.round(Number(parVal)) : null;
      const y = yards != null && Number.isFinite(Number(yards)) ? Math.round(Number(yards)) : null;
      return {
        course_id: courseId,
        tee_name: teeName,
        course_rating: cr,
        slope_rating: sr,
        par_total: pt,
        yards: y,
        gender: t.gender ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from("course_tees")
      .upsert(row, { onConflict: "course_id,tee_name" });

    if (error) {
      if ((error as any).code === "23505" || (error as any).message?.includes("duplicate")) {
        skipped++;
        continue;
      }
      console.warn("[courseRepo] upsertTeesFromApi upsert:", error.message, "tee:", row.tee_name);
    } else {
      inserted++;
    }
  }
  console.log("[courseRepo] upsertTeesFromApi: inserted", inserted, "skipped", skipped);

  return getTeesByCourseId(courseId);
}

/**
 * Search courses by name (for event creation: Search Course → Select Tee).
 *
 * Selects only `id, name` (always present), then tries to get location
 * from `area`, `city`, or `country` — the schema varies across setups.
 */
export async function searchCourses(
  query: string,
  limit = 20
): Promise<SearchCoursesResult> {
  const q = (query || "").trim();
  if (!q) return { data: [], error: null };

  console.log("[courseRepo] searchCourses:", q);

  // Select all columns (*) so we can pick location from whatever exists
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .ilike("course_name", `%${q}%`)
    .order("course_name")
    .limit(limit);

  if (error) {
    console.error("[courseRepo] searchCourses failed:", error.message, error.code, error.details);
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { data: [], error: "courses table not found — run migrations" };
    }
    return { data: [], error: error.message };
  }

  console.log("[courseRepo] searchCourses returned", (data ?? []).length, "hits");

  const hits = (data ?? []).map((row: any) => {
    const location = row.area || row.city || row.country || null;
    return {
      id: row.id,
      name: row.course_name ?? row.name ?? "",
      location,
    };
  });
  return { data: hits, error: null };
}

