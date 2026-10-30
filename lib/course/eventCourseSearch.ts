/**
 * Event create/edit course search: local DB (seeded/imported courses) + GolfCourseAPI.
 */

import {
  getCourseByApiId,
  getTeesByCourseId,
  searchCourses as searchCoursesDb,
  type CourseTee,
} from "@/lib/db_supabase/courseRepo";
import { importCourse, type ImportedCourse } from "@/lib/importCourse";
import { getCourseById, searchCourses as searchCoursesApi } from "@/lib/golfApi";
import { mergeEventCourseSearchHits, type EventCourseSearchHit } from "@/lib/course/eventCourseSearchMerge";

export type { EventCourseSearchHit } from "@/lib/course/eventCourseSearchMerge";
export { mergeEventCourseSearchHits } from "@/lib/course/eventCourseSearchMerge";

function mapImportedTees(result: ImportedCourse): CourseTee[] {
  return result.tees.map((t) => ({
    id: t.id,
    course_id: result.courseId,
    tee_name: t.teeName,
    tee_color: null,
    course_rating: t.courseRating ?? 0,
    slope_rating: t.slopeRating ?? null,
    par_total: t.parTotal ?? 0,
    gender: t.gender ?? null,
    yards: t.yards ?? null,
  }));
}

export async function searchCoursesForEvent(query: string, limit = 25): Promise<EventCourseSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const [dbResult, apiHits] = await Promise.all([
    searchCoursesDb(q, limit).catch(() => ({ data: [], error: null })),
    searchCoursesApi(q).catch(() => []),
  ]);

  return mergeEventCourseSearchHits(dbResult.data ?? [], apiHits);
}

/** Load tees after the user picks a search result (DB or API). */
export async function loadTeesForEventCourseHit(hit: EventCourseSearchHit): Promise<{
  courseId: string;
  courseName: string;
  tees: CourseTee[];
}> {
  if (hit.source === "db") {
    const tees = await getTeesByCourseId(hit.courseId);
    return { courseId: hit.courseId, courseName: hit.name, tees };
  }

  const cached = await getCourseByApiId(hit.apiId);
  if (cached && cached.tees.length > 0) {
    return { courseId: cached.courseId, courseName: cached.courseName, tees: cached.tees };
  }

  const full = await getCourseById(hit.apiId);
  const result = await importCourse(full);

  if (result.courseId.startsWith("api-course-")) {
    return { courseId: result.courseId, courseName: result.courseName, tees: mapImportedTees(result) };
  }

  const freshTees = await getTeesByCourseId(result.courseId).catch(() => [] as CourseTee[]);
  const tees = freshTees.length > 0 ? freshTees : mapImportedTees(result);
  return { courseId: result.courseId, courseName: result.courseName, tees };
}
