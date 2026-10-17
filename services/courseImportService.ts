/**
 * Orchestrates GolfCourseAPI → normalize → Supabase import (importer only).
 *
 * Future scoring: use {@link getEventCourseContext} — `holes` are immutable `event_course_holes` rows;
 * use `teeRatingSnapshot` for WHS (CR / slope / par). Do not read live `course_holes` for completed events.
 * Never depend on this importer at score-entry runtime.
 */

import { getCourseById } from "@/lib/golfApi";
import { logNormalizedCourseImportHoleWarnings, normalizeGolfCourseApiCourse } from "@/lib/courseNormalizer";
import { persistNormalizedCourseImport, getTeesByCourseId, type CourseTee } from "@/lib/courseRepo";
import type { GolfCourseApiCourse } from "@/types/course";
import type { PersistedCourseImport } from "@/types/course";
import type { ImportedCourse, ImportedTee } from "@/types/course";

const inflightByApiId = new Map<number, Promise<PersistedCourseImport>>();

function mapDbTeesToImported(tees: CourseTee[]): ImportedTee[] {
  return tees.map((t) => ({
    id: t.id,
    teeName: t.tee_name,
    courseRating: t.course_rating,
    slopeRating: t.slope_rating,
    parTotal: t.par_total,
    gender: t.gender ?? null,
    yards: t.yards ?? null,
  }));
}

/**
 * Full import from numeric GolfCourseAPI id (fetch → normalize → persist).
 */
export async function importCourseFromApiId(apiId: number): Promise<PersistedCourseImport> {
  const existing = inflightByApiId.get(apiId);
  if (existing) return existing;

  const job = (async () => {
    if (__DEV__) console.log("[courseImport] importCourseFromApiId: fetch", { apiId });
    const raw = await getCourseById(apiId);
    const normalized = normalizeGolfCourseApiCourse(raw);
    logNormalizedCourseImportHoleWarnings(normalized);
    if (__DEV__) {
      console.log("[courseImport] importCourseFromApiId: normalized tee names", normalized.tees.map(({ tee }) => tee.teeName));
    }
    if (__DEV__) console.log("[courseImport] importCourseFromApiId: persist", {
      apiId,
      teeCount: normalized.tees.length,
      holeCount: normalized.tees.reduce((a, t) => a + t.holes.length, 0),
    });
    const result = await persistNormalizedCourseImport(normalized);
    if (result.skipped_reason) {
      console.warn("[courseImport] importCourseFromApiId: persist skipped", result.skipped_reason, { courseId: result.courseId });
    }
    if (__DEV__) {
      console.log("[courseImport] importCourseFromApiId: persisted tee names", result.tees.map((t) => t.teeName));
      if (result.teeReconciliation) {
        console.log("[courseImport] importCourseFromApiId: tee reconciliation", result.teeReconciliation);
      }
    }
    if (__DEV__) console.log("[courseImport] importCourseFromApiId: done", {
      courseId: result.courseId,
      teeCount: result.teeCount,
      holeCount: result.holeCount,
    });
    return result;
  })();

  inflightByApiId.set(apiId, job);
  try {
    return await job;
  } finally {
    inflightByApiId.delete(apiId);
  }
}

/**
 * Import when the caller already holds the API payload (e.g. after search → detail fetch).
 */
export async function importCourseFromApiPayload(apiCourse: GolfCourseApiCourse): Promise<PersistedCourseImport> {
  if (!apiCourse?.id || !Number.isFinite(Number(apiCourse.id))) {
    throw new Error("importCourseFromApiPayload: invalid course id");
  }
  if (__DEV__) console.log("[courseImport] importCourseFromApiPayload: normalize + persist", { apiId: apiCourse.id });
  const normalized = normalizeGolfCourseApiCourse(apiCourse);
  logNormalizedCourseImportHoleWarnings(normalized);
  if (__DEV__) {
    console.log("[courseImport] importCourseFromApiPayload: normalized tee names", normalized.tees.map(({ tee }) => tee.teeName));
  }
  try {
    const out = await persistNormalizedCourseImport(normalized);
    if (__DEV__) {
      console.log("[courseImport] importCourseFromApiPayload: persisted tee names", out.tees.map((t) => t.teeName));
      if (out.teeReconciliation) console.log("[courseImport] importCourseFromApiPayload: tee reconciliation", out.teeReconciliation);
    }
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[courseImport] importCourseFromApiPayload: persist failed", msg);
    throw e;
  }
}

/**
 * App-facing import used by event flows: returns stable DB UUIDs for course + tees.
 */
export async function importCourseForEventFlow(apiCourse: GolfCourseApiCourse): Promise<ImportedCourse> {
  const persisted = await importCourseFromApiPayload(apiCourse);
  const tees = await getTeesByCourseId(persisted.courseId);
  return {
    courseId: persisted.courseId,
    courseName: persisted.courseName,
    tees: mapDbTeesToImported(tees),
    imported: !persisted.skipped_reason,
  };
}
