// Course and course_tees for event setup (search course → select tee)
import { supabase } from "@/lib/supabase";
import { isValidUuid } from "@/lib/uuid";

/** Log full courses query before execution (for debugging 400 errors). */
function logCoursesQuery(
  context: string,
  opts: { select: string; filters: Record<string, unknown>; order?: string; limit?: number }
) {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const params = new URLSearchParams();
  params.set("select", opts.select);
  for (const [k, v] of Object.entries(opts.filters)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  if (opts.order) params.set("order", opts.order);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  const path = `/rest/v1/courses?${params.toString()}`;
  const fullUrl = base ? `${base.replace(/\/$/, "")}${path}` : path;
  console.log(`[courses] ${context} FULL QUERY:`, {
    select: opts.select,
    filters: opts.filters,
    order: opts.order,
    limit: opts.limit,
    builtPath: path,
    fullUrl,
  });
}

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
  city?: string | null;
  country?: string | null;
};

/** Alias for CourseSearchHit (used by CoursePicker) */
export type CourseDoc = CourseSearchHit;

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

  const canonicalId = await getCanonicalCourseId(courseId, options?.courseName);
  const localTees = await getTeesByCourseId(canonicalId);
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
      try {
        const { data: blueInCourseTees } = await supabase
          .from("course_tees")
          .select("id, course_id, tee_name")
          .ilike("tee_name", "%blue%");
        const selectStr = "*";
        logCoursesQuery("Shrivenham __DEV__", {
          select: selectStr,
          filters: { "course_name": "ilike.%shrivenham%" },
        });
        const { data: allShrivenhamCourses } = await supabase
          .from("courses")
          .select(selectStr)
          .ilike("course_name", "%shrivenham%");
        console.log("[courseRepo] TEE INVESTIGATION (Shrivenham):", {
          currentCourseId: courseId,
          localTeeNames: localTees.map((t) => t.tee_name),
          hasBlueInLocal: localTees.some((t) => (t.tee_name || "").toLowerCase().includes("blue")),
          blueInCourseTees: blueInCourseTees ?? [],
          allShrivenhamCourseIds: (allShrivenhamCourses ?? []).map((c) => ({ id: c.id, name: c.course_name })),
          eventTeeNames: options?.eventTeeNames,
        });
      } catch (e) {
        console.warn("[courseRepo] Shrivenham investigation failed:", (e as Error)?.message);
      }
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
      course_id: canonicalId,
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
      try {
        const selectStr = "id,course_name";
        logCoursesQuery("includeOtherCourseTees", {
          select: selectStr,
          filters: { id: `neq.${canonicalId}`, "course_name": `ilike.%${searchTerm}%` },
        });
        const { data: otherCourses, error } = await supabase
          .from("courses")
          .select(selectStr)
          .neq("id", canonicalId)
          .ilike("course_name", `%${searchTerm}%`);

        if (error) {
          console.warn("[courseRepo] includeOtherCourseTees failed:", error.message, error.code);
        } else {
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
      } catch (e) {
        console.warn("[courseRepo] includeOtherCourseTees exception:", (e as Error)?.message);
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
function normalizeCourseNameForMatch(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find canonical course_id for a course name (for import deduplication).
 * Returns a course that has tees and matches the normalized name, if one exists.
 */
export async function getCanonicalCourseByNormalizedName(
  courseName: string,
  excludeCourseId?: string
): Promise<{ id: string; course_name: string } | null> {
  const norm = normalizeCourseNameForMatch(courseName);
  if (norm.length < 4) return null;
  const searchTerm = norm.split(/\s+/)[0];
  const selectStr = "id,course_name";
  logCoursesQuery("getCanonicalCourseByNormalizedName", {
    select: selectStr,
    filters: { "course_name": `ilike.%${searchTerm}%` },
  });
  const { data: courses } = await supabase
    .from("courses")
    .select(selectStr)
    .ilike("course_name", `%${searchTerm}%`);
  for (const c of courses ?? []) {
    if (excludeCourseId && c.id === excludeCourseId) continue;
    const tees = await getTeesByCourseId(c.id);
    if (tees.length > 0) {
      const cNorm = normalizeCourseNameForMatch(c.course_name ?? "");
      const firstWord = norm.split(/\s+/)[0];
      const cFirst = cNorm.split(/\s+/)[0];
      if (firstWord && cFirst && (firstWord.startsWith(cFirst) || cFirst.startsWith(firstWord))) {
        return { id: c.id, course_name: c.course_name ?? "" };
      }
    }
  }
  return null;
}

/**
 * Find canonical course_id for tee operations.
 * If the given course has 0 tees:
 * 1. Try name-based search for another course with similar name that has tees.
 * 2. Try api_id fallback: get course by id → api_id, then find course with same api_id that has tees.
 * Prefer the course that already has tees (canonical row).
 */
export async function getCanonicalCourseId(
  courseId: string,
  courseName?: string
): Promise<string> {
  if (!isValidUuid(courseId)) return courseId;
  const tees = await getTeesByCourseId(courseId);
  if (tees.length > 0) return courseId;

  // 1. Name-based search
  const name = (courseName || "").trim();
  if (name.length >= 4) {
    const searchTerm = name.split(/\s+/)[0];
        const selectStr = "id,course_name";
        logCoursesQuery("getCanonicalCourseId (name)", {
          select: selectStr,
          filters: { "course_name": `ilike.%${searchTerm}%` },
        });
        try {
          const { data: courses, error } = await supabase
        .from("courses")
        .select(selectStr)
        .ilike("course_name", `%${searchTerm}%`);

      if (error) {
        console.warn("[courseRepo] getCanonicalCourseId name search failed:", error.message);
      } else {
        for (const c of courses ?? []) {
          if (c.id === courseId) continue;
          const otherTees = await getTeesByCourseId(c.id);
          if (otherTees.length > 0) {
            console.log("[courseRepo] Using canonical course (name)", c.id, c.course_name, "instead of", courseId);
            return c.id;
          }
        }
      }
    } catch (e) {
      console.warn("[courseRepo] getCanonicalCourseId name search exception:", (e as Error)?.message);
    }
  }

  // api_id fallback DISABLED — broken Supabase courses query returns 400.
  // Return courseId; caller uses event snapshot or manual entry.
  return courseId;
}

/**
 * Persist manually entered tees to course_tees so they are reusable for future events.
 * Uses canonical course_id (prefers course with existing tees).
 */
export async function upsertManualTeesToCourse(
  courseId: string,
  courseName: string | undefined,
  tees: {
    male?: { tee_name: string; par?: number; course_rating?: number; slope_rating?: number };
    female?: { tee_name: string; par?: number; course_rating?: number; slope_rating?: number };
  }
): Promise<void> {
  const canonicalId = await getCanonicalCourseId(courseId, courseName);
  if (!isValidUuid(canonicalId)) return;
  const rows: { course_id: string; tee_name: string; par_total: number | null; course_rating: number | null; slope_rating: number | null }[] = [];
  if (tees.male?.tee_name?.trim()) {
    rows.push({
      course_id: canonicalId,
      tee_name: tees.male.tee_name.trim(),
      par_total: tees.male.par != null && Number.isFinite(tees.male.par) ? Math.round(tees.male.par) : null,
      course_rating: tees.male.course_rating != null && Number.isFinite(tees.male.course_rating) ? tees.male.course_rating : null,
      slope_rating: tees.male.slope_rating != null && Number.isFinite(tees.male.slope_rating) ? Math.round(tees.male.slope_rating) : null,
    });
  }
  if (tees.female?.tee_name?.trim() && tees.female.tee_name.trim() !== tees.male?.tee_name?.trim()) {
    rows.push({
      course_id: canonicalId,
      tee_name: tees.female.tee_name.trim(),
      par_total: tees.female.par != null && Number.isFinite(tees.female.par) ? Math.round(tees.female.par) : null,
      course_rating: tees.female.course_rating != null && Number.isFinite(tees.female.course_rating) ? tees.female.course_rating : null,
      slope_rating: tees.female.slope_rating != null && Number.isFinite(tees.female.slope_rating) ? Math.round(tees.female.slope_rating) : null,
    });
  }
  for (const row of rows) {
    const { error } = await supabase
      .from("course_tees")
      .upsert(row, { onConflict: "course_id,tee_name" });
    if (error) {
      console.warn("[courseRepo] upsertManualTeesToCourse failed:", row.tee_name, error.message);
    } else {
      console.log("[courseRepo] Persisted manual tee to course_tees:", row.tee_name);
    }
  }
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
 * TEMPORARY: uses select("*") to avoid 400 from invalid column in select.
 */
export async function getCourseByApiId(apiId: number): Promise<CourseWithTees | null> {
  const selectStr = "*";
  logCoursesQuery("getCourseByApiId", {
    select: selectStr,
    filters: { api_id: apiId },
  });
  try {
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .select(selectStr)
      .eq("api_id", apiId)
      .maybeSingle();

    if (courseErr) {
      console.error("[courseRepo] getCourseByApiId FAILED:", {
        message: courseErr.message,
        code: courseErr.code,
        details: courseErr.details,
        hint: courseErr.hint,
      });
      return null;
    }
    if (!course) return null;
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
      courseName: course.course_name ?? "",
      tees,
      fromCache: true,
    };
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string; details?: unknown; hint?: string };
    console.error("[courseRepo] getCourseByApiId exception:", {
      message: e?.message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
    });
    return null;
  }
}

/**
 * Get course by UUID (for api_id fallback when event has course_id but 0 tees).
 * Returns { id, api_id, course_name } or null. Does NOT throw.
 */
export async function getCourseByIdForApiLookup(courseId: string): Promise<{
  id: string;
  api_id: number | null;
  course_name: string;
} | null> {
  if (!isValidUuid(courseId)) return null;
  const selectStr = "*";
  logCoursesQuery("getCourseByIdForApiLookup", {
    select: selectStr,
    filters: { id: courseId },
  });
  try {
    const { data, error } = await supabase
      .from("courses")
      .select(selectStr)
      .eq("id", courseId)
      .maybeSingle();

    if (error) {
      console.error("[courseRepo] getCourseByIdForApiLookup FAILED:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }
    if (!data) return null;
    return {
      id: data.id,
      api_id: data.api_id != null ? Number(data.api_id) : null,
      course_name: data.course_name ?? "",
    };
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[courseRepo] getCourseByIdForApiLookup exception:", e?.message);
    return null;
  }
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
 * Uses course_name (not name) — courses table has course_name column.
 */
export async function searchCourses(
  query: string,
  limit = 20
): Promise<SearchCoursesResult> {
  const q = (query || "").trim();
  if (!q) return { data: [], error: null };

  const selectStr = "id,course_name,area";
  logCoursesQuery("searchCourses", {
    select: selectStr,
    filters: { "course_name": `ilike.%${q}%` },
    order: "course_name.asc",
    limit,
  });
  const { data, error } = await supabase
    .from("courses")
    .select(selectStr)
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
      name: row.course_name ?? "",
      location,
      city: row.city ?? null,
      country: row.country ?? null,
    };
  });
  return { data: hits, error: null };
}

