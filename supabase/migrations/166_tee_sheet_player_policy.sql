-- Persist ManCo tee-sheet manual sex/tee selections across draft save/reload.

ALTER TABLE public.tee_group_players
  ADD COLUMN IF NOT EXISTS manual_gender text NULL,
  ADD COLUMN IF NOT EXISTS manual_tee_assignment text NULL,
  ADD COLUMN IF NOT EXISTS manual_tee_override text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tee_group_players_manual_gender_check'
  ) THEN
    ALTER TABLE public.tee_group_players
      ADD CONSTRAINT tee_group_players_manual_gender_check
      CHECK (manual_gender IS NULL OR manual_gender IN ('male', 'female'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tee_group_players_manual_tee_assignment_check'
  ) THEN
    ALTER TABLE public.tee_group_players
      ADD CONSTRAINT tee_group_players_manual_tee_assignment_check
      CHECK (manual_tee_assignment IS NULL OR manual_tee_assignment IN ('men', 'ladies'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tee_group_players_manual_tee_override_check'
  ) THEN
    ALTER TABLE public.tee_group_players
      ADD CONSTRAINT tee_group_players_manual_tee_override_check
      CHECK (manual_tee_override IS NULL OR manual_tee_override IN ('men', 'ladies'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.tee_sheet_player_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  manual_gender text NULL,
  manual_tee_assignment text NULL,
  manual_tee_override text NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, player_id),
  CONSTRAINT tee_sheet_player_policy_manual_gender_check
    CHECK (manual_gender IS NULL OR manual_gender IN ('male', 'female')),
  CONSTRAINT tee_sheet_player_policy_manual_tee_assignment_check
    CHECK (manual_tee_assignment IS NULL OR manual_tee_assignment IN ('men', 'ladies')),
  CONSTRAINT tee_sheet_player_policy_manual_tee_override_check
    CHECK (manual_tee_override IS NULL OR manual_tee_override IN ('men', 'ladies'))
);

ALTER TABLE public.tee_sheet_player_policy
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL;
ALTER TABLE public.tee_sheet_player_policy
  ADD COLUMN IF NOT EXISTS manual_tee_override text NULL;

DROP TRIGGER IF EXISTS trg_tee_sheet_player_policy_updated_at ON public.tee_sheet_player_policy;
CREATE TRIGGER trg_tee_sheet_player_policy_updated_at
  BEFORE UPDATE ON public.tee_sheet_player_policy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tee_sheet_player_policy_event
  ON public.tee_sheet_player_policy (event_id);

ALTER TABLE public.tee_sheet_player_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tee_sheet_player_policy_select ON public.tee_sheet_player_policy;
DROP POLICY IF EXISTS tee_sheet_player_policy_insert ON public.tee_sheet_player_policy;
DROP POLICY IF EXISTS tee_sheet_player_policy_update ON public.tee_sheet_player_policy;
DROP POLICY IF EXISTS tee_sheet_player_policy_delete ON public.tee_sheet_player_policy;

CREATE POLICY tee_sheet_player_policy_select ON public.tee_sheet_player_policy FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids())));

CREATE POLICY tee_sheet_player_policy_insert ON public.tee_sheet_player_policy FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

CREATE POLICY tee_sheet_player_policy_update ON public.tee_sheet_player_policy FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));

CREATE POLICY tee_sheet_player_policy_delete ON public.tee_sheet_player_policy FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()) AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])));
