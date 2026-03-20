-- =====================================================
-- PHASE 1 JOINT EVENTS: oom_awards
-- =====================================================
-- Immutable record of OOM points awarded per event per society.
-- Supports joint events where each society awards its own OOM.
-- Does NOT modify existing event_results.
--
-- ROLLBACK: DROP TABLE IF EXISTS public.oom_awards CASCADE;
-- =====================================================

CREATE TABLE IF NOT EXISTS public.oom_awards (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  society_id        uuid        NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  player_id         uuid        NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  result_scope      text        NOT NULL DEFAULT 'overall' CHECK (result_scope IN ('overall', 'society', 'division', 'category')),
  position          integer     NOT NULL,
  points_awarded    numeric(6,2) NOT NULL DEFAULT 0,
  rule_version      text,
  source            text        NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual', 'imported')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oom_awards_event_id
  ON public.oom_awards(event_id);
CREATE INDEX IF NOT EXISTS idx_oom_awards_society_id
  ON public.oom_awards(society_id);
CREATE INDEX IF NOT EXISTS idx_oom_awards_player_id
  ON public.oom_awards(player_id);
CREATE INDEX IF NOT EXISTS idx_oom_awards_society_member
  ON public.oom_awards(society_id, player_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oom_awards_event_society_player_scope
  ON public.oom_awards(event_id, society_id, player_id, result_scope);

COMMENT ON TABLE public.oom_awards IS
  'OOM points awarded per event per society. Supports joint events. Ledger-style.';
COMMENT ON COLUMN public.oom_awards.result_scope IS
  'overall=full field; society=within society; division=men/ladies; category=handicap band';
COMMENT ON COLUMN public.oom_awards.rule_version IS
  'Version of points rules used (e.g. 2024_v1) for audit';
COMMENT ON COLUMN public.oom_awards.source IS
  'auto=calculated; manual=admin override; imported=legacy data';

ALTER TABLE public.oom_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY oom_awards_select
  ON public.oom_awards FOR SELECT TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = oom_awards.event_id
        AND es.society_id IN (SELECT public.my_society_ids())
    )
  );

CREATE POLICY oom_awards_insert
  ON public.oom_awards FOR INSERT TO authenticated
  WITH CHECK (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'handicapper', 'secretary'])
  );

CREATE POLICY oom_awards_update
  ON public.oom_awards FOR UPDATE TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain', 'handicapper', 'secretary'])
  );

CREATE POLICY oom_awards_delete
  ON public.oom_awards FOR DELETE TO authenticated
  USING (
    society_id IN (SELECT public.my_society_ids())
    AND public.has_role_in_society(society_id, ARRAY['captain'])
  );
