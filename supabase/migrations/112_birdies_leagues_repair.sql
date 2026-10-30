-- Idempotent repair / completion for Birdies League DDL + RLS.
-- Use when a prior 111 attempt may have left a partial state, or to reset policies after role-check fixes.
-- Safe to run after a successful 111 (drops and recreates the same three policies).
-- This migration defines no helper functions or views (none were part of 111).

CREATE TABLE IF NOT EXISTS public.birdies_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Birdies League',
  season_label text NULL,
  start_from_event_id uuid NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  start_date timestamptz NULL,
  event_scope text NOT NULL CHECK (event_scope IN ('all_official', 'oom_only')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT birdies_leagues_active_requires_start_event CHECK (
    NOT (status = 'active' AND start_from_event_id IS NULL)
  )
);

COMMENT ON TABLE public.birdies_leagues IS
  'Seasonal birdies competition: totals official event_results.birdie_count from start_from_event_id onward; guests excluded.';
COMMENT ON COLUMN public.birdies_leagues.start_from_event_id IS
  'First eligible society event that was still unplayed when the league was created; earlier events never count.';
COMMENT ON COLUMN public.birdies_leagues.start_date IS
  'When the league was started (typically created_at semantics).';
COMMENT ON COLUMN public.birdies_leagues.event_scope IS
  'all_official: non-friendly classifications; oom_only: Order of Merit events only.';

CREATE UNIQUE INDEX IF NOT EXISTS birdies_leagues_one_active_per_society
  ON public.birdies_leagues (society_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_birdies_leagues_society_id ON public.birdies_leagues (society_id);

ALTER TABLE public.birdies_leagues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS birdies_leagues_select ON public.birdies_leagues;
DROP POLICY IF EXISTS birdies_leagues_insert ON public.birdies_leagues;
DROP POLICY IF EXISTS birdies_leagues_update ON public.birdies_leagues;

CREATE POLICY birdies_leagues_select ON public.birdies_leagues
  FOR SELECT TO authenticated
  USING (
    society_id IN (
      SELECT m.society_id FROM public.members m
      WHERE m.user_id = auth.uid()
    )
  );

CREATE POLICY birdies_leagues_insert ON public.birdies_leagues
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = society_id
        AND m.user_id = auth.uid()
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'HANDICAPPER')
    )
  );

CREATE POLICY birdies_leagues_update ON public.birdies_leagues
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = society_id
        AND m.user_id = auth.uid()
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'HANDICAPPER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = society_id
        AND m.user_id = auth.uid()
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'HANDICAPPER')
    )
  );

NOTIFY pgrst, 'reload schema';
