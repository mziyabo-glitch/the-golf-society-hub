# Nightly Course Import Engine

## What this adds

- Supabase schema support for import metadata, job logs, and manual overrides.
- Node-safe ingestion pipeline that:
  - resolves source/API id
  - fetches raw payload
  - normalizes
  - validates
  - upserts
  - re-applies manual overrides by default
  - logs per-course job result
- GitHub Actions scheduler for overnight automation.

## Migrations

- `supabase/migrations/125_course_import_engine.sql`
  - Adds sync/provenance fields on `courses`, `course_tees`, `course_holes`.
  - Adds `course_import_jobs`.
  - Adds `course_manual_overrides`.
  - Adds constraints/indexes for safe upserts and uniqueness.

## Local run

1. Ensure env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOLFCOURSE_API_KEY`
2. Apply migration `125_course_import_engine.sql`.
3. Run dry test:
   - `npm run course-import:nightly:dry`
4. Run write mode:
   - `npm run course-import:nightly`

## Auto overnight run

- Workflow: `.github/workflows/nightly-course-import.yml`
- Trigger: daily at `02:15 UTC` plus manual `workflow_dispatch`.
- Required GitHub Secrets:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `GOLFCOURSE_API_KEY`

## Manual override precedence

- Overrides are stored in `course_manual_overrides`.
- Import defaults to preserving overrides (`preserve_on_import = true`) by re-applying them after each upsert.
- Use CLI flag `--overwrite-manual` only when explicit overwrite is intended.

## Initial seed scope

- Priority seeds:
  - Upavon Golf Club
  - Shrivenham Park Golf Club
  - Wycombe Heights Golf Centre
- Extension scope:
  - Imports additionally discover event course names used by societies with `M4`/`ZGS` in name.

## Current limitations

- Source selection currently prioritizes GolfCourseAPI and course-name search heuristics when `api_id` is missing.
- Manual override values are field-level and rely on exact `field_name` alignment to target table columns.
- M4/ZGS expansion depends on society naming convention and existing event `course_name` values.
- No deduplicated “batch summary” table yet; logging is per-course row in `course_import_jobs`.

## Admin course data tools

- Route: `/(app)/course-data`
  - Admin review list with sync metadata, confidence, SI integrity flags, latest import status, and override counts.
  - Safe manual override workflow (whitelist + typed number coercion + SI range checks).
  - Supports create/update and disable/remove by scope.
- Route: `/(app)/course-data/[courseId]/tee/[teeId]`
  - Premium hole-by-hole editor for par/yardage/stroke index overrides.
  - Inline save/clear actions per hole field.
  - Re-import action preserves active manual overrides.

## Role access

- DB policies for `course_import_jobs` and `course_manual_overrides` are tightened in:
  - `supabase/migrations/126_course_import_admin_policy.sql`
- Access is restricted to authenticated users who are Captain/Secretary/Handicapper in at least one society.
