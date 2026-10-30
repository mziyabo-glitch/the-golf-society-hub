/**
 * Course persistence + event/course helpers (Supabase).
 * Canonical implementation lives in `lib/db_supabase/courseRepo.ts`; this file is the stable import path for app code.
 */
export * from "@/lib/db_supabase/courseRepo";
export { assertEventScoringReady, validateEventHoleSnapshotSet } from "@/lib/scoring/eventScoringReadiness";
