/**
 * Real GolfCourseAPI + Supabase E2E (run explicitly — not part of default unit suite).
 *
 *   npm run course-import:e2e
 *
 * Env: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *      golf API key (see lib/env.ts),
 *      COURSE_IMPORT_E2E_EVENT_ID OR COURSE_IMPORT_E2E_AUTOPICK_EVENT=1
 * Migrations: 114–118 applied on the target project (117: tee_id FKs → course_tees; 118: course_tees.is_active reconciliation).
 */

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  attachCourseAndTeeToEvent,
  getCourseWithTeesAndHoles,
  getEventCourseContext,
  getTeesByCourseId,
  resetCourseRepoSupabase,
  setCourseRepoSupabase,
} from "@/lib/db_supabase/courseRepo";
import { resetEventRepoSupabaseClient, setEventRepoSupabaseClient } from "@/lib/db_supabase/eventRepo";
import { searchCourses } from "@/lib/golfApi";
import { importCourseFromApiId } from "@/services/courseImportService";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const golfConfigured =
  !!(process.env.EXPO_PUBLIC_GOLFCOURSE_API_KEY ||
    process.env.GOLFCOURSE_API_KEY ||
    process.env.EXPO_PUBLIC_GOLF_API_KEY ||
    process.env.NEXT_PUBLIC_GOLF_API_KEY ||
    process.env.GOLF_API_KEY);

const runE2e =
  !!supabaseUrl &&
  !!serviceKey &&
  golfConfigured &&
  (!!process.env.COURSE_IMPORT_E2E_EVENT_ID?.trim() || process.env.COURSE_IMPORT_E2E_AUTOPICK_EVENT === "1");

describe("course import E2E (real API + Supabase)", () => {
  it.skipIf(!runE2e)("search → import → attach → context → re-import idempotency", async () => {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let resolvedEventId = process.env.COURSE_IMPORT_E2E_EVENT_ID?.trim() || "";
    if (!resolvedEventId && process.env.COURSE_IMPORT_E2E_AUTOPICK_EVENT === "1") {
      const { data: evPick, error: pickErr } = await admin
        .from("events")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(pickErr, String(pickErr)).toBeNull();
      expect(evPick?.id).toBeTruthy();
      resolvedEventId = String(evPick!.id);
    }

    setCourseRepoSupabase(admin);
    setEventRepoSupabaseClient(admin);
    try {
      const query = process.env.COURSE_IMPORT_E2E_SEARCH?.trim() || "Wycombe";
      const hits = await searchCourses(query);
      expect(hits.length, "search result count").toBeGreaterThan(0);
      const first = hits[0]!;

      const persisted1 = await importCourseFromApiId(first.id);
      expect(persisted1.courseId).toBeTruthy();
      expect(persisted1.teeCount).toBeGreaterThan(0);
      const activeTeesAfterImport1 = await getTeesByCourseId(persisted1.courseId);
      expect(activeTeesAfterImport1.length, "active DB tee rows must match normalized import count").toBe(persisted1.teeCount);
      expect(persisted1.teeReconciliation?.dbActiveTeeCountAfter ?? persisted1.teeCount).toBe(persisted1.teeCount);

      const withData1 = await getCourseWithTeesAndHoles(persisted1.courseId);
      expect(withData1).toBeTruthy();
      let holeCountFirst = 0;
      for (const t of withData1!.tees) {
        holeCountFirst += withData1!.holesByTeeId[t.id]?.length ?? 0;
      }
      expect(holeCountFirst).toBeGreaterThan(0);
      expect(withData1!.tees.length, "getCourseWithTeesAndHoles uses active tees only").toBe(persisted1.teeCount);

      const teeId = persisted1.tees[0]?.id ?? withData1!.tees[0]!.id;
      await attachCourseAndTeeToEvent(resolvedEventId, persisted1.courseId, teeId, withData1!.courseName || first.name);

      const ctx = await getEventCourseContext(resolvedEventId);
      expect(ctx).toBeTruthy();
      expect(ctx!.teeRatingSnapshot?.courseRating, "tee snapshot").toBeTruthy();
      expect(ctx!.holes.length, "hole snapshot count").toBeGreaterThan(0);
      expect(ctx!.holes[0]!.event_id).toBe(resolvedEventId);

      const persisted2 = await importCourseFromApiId(first.id);
      expect(persisted2.courseId).toBe(persisted1.courseId);

      const withData2 = await getCourseWithTeesAndHoles(persisted1.courseId);
      let holeCountSecond = 0;
      for (const t of withData2!.tees) {
        holeCountSecond += withData2!.holesByTeeId[t.id]?.length ?? 0;
      }
      expect(holeCountSecond).toBe(holeCountFirst);

      const ctx2 = await getEventCourseContext(resolvedEventId);
      expect(JSON.stringify(ctx2!.teeRatingSnapshot)).toBe(JSON.stringify(ctx!.teeRatingSnapshot));
      expect(ctx2!.holes.length).toBe(ctx!.holes.length);
    } finally {
      resetCourseRepoSupabase();
      resetEventRepoSupabaseClient();
    }
  });
});
