-- Free Play Scorecards (personal/social rounds, not tied to events/OOM).

CREATE TABLE IF NOT EXISTS public.free_play_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id uuid NULL REFERENCES public.societies(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL,
  created_by_member_id uuid NULL REFERENCES public.members(id) ON DELETE SET NULL,
  course_id uuid NULL REFERENCES public.courses(id) ON DELETE SET NULL,
  course_name text NOT NULL,
  tee_id uuid NULL REFERENCES public.course_tees(id) ON DELETE SET NULL,
  tee_name text NULL,
  join_code text NOT NULL UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 8)),
  scoring_mode text NOT NULL DEFAULT 'quick' CHECK (scoring_mode IN ('quick', 'hole_by_hole')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_play_rounds_created_by ON public.free_play_rounds(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_free_play_rounds_society_id ON public.free_play_rounds(society_id);
CREATE INDEX IF NOT EXISTS idx_free_play_rounds_join_code ON public.free_play_rounds(join_code);

CREATE TABLE IF NOT EXISTS public.free_play_round_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.free_play_rounds(id) ON DELETE CASCADE,
  player_type text NOT NULL CHECK (player_type IN ('member', 'app_user', 'guest')),
  member_id uuid NULL REFERENCES public.members(id) ON DELETE SET NULL,
  user_id uuid NULL,
  invite_email text NULL,
  display_name text NOT NULL,
  handicap_index numeric(4,1) NOT NULL DEFAULT 0,
  invite_status text NOT NULL DEFAULT 'none' CHECK (invite_status IN ('none', 'invited', 'joined')),
  is_owner boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_free_play_round_players_round_id ON public.free_play_round_players(round_id);
CREATE INDEX IF NOT EXISTS idx_free_play_round_players_user_id ON public.free_play_round_players(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_play_round_players_member
  ON public.free_play_round_players(round_id, member_id)
  WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_free_play_round_players_user
  ON public.free_play_round_players(round_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.free_play_round_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.free_play_rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL REFERENCES public.free_play_round_players(id) ON DELETE CASCADE,
  quick_total integer NULL CHECK (quick_total IS NULL OR (quick_total >= 0 AND quick_total <= 220)),
  holes_played integer NOT NULL DEFAULT 0 CHECK (holes_played >= 0 AND holes_played <= 27),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_play_round_scores_round_player_uniq UNIQUE (round_id, round_player_id)
);

CREATE INDEX IF NOT EXISTS idx_free_play_round_scores_round_id ON public.free_play_round_scores(round_id);

CREATE TABLE IF NOT EXISTS public.free_play_round_hole_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.free_play_rounds(id) ON DELETE CASCADE,
  round_player_id uuid NOT NULL REFERENCES public.free_play_round_players(id) ON DELETE CASCADE,
  hole_number integer NOT NULL CHECK (hole_number >= 1 AND hole_number <= 27),
  gross_strokes integer NOT NULL CHECK (gross_strokes >= 1 AND gross_strokes <= 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT free_play_round_hole_scores_round_player_hole_uniq UNIQUE (round_id, round_player_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_free_play_round_hole_scores_round_id ON public.free_play_round_hole_scores(round_id);
CREATE INDEX IF NOT EXISTS idx_free_play_round_hole_scores_player ON public.free_play_round_hole_scores(round_player_id);

DROP TRIGGER IF EXISTS trg_free_play_rounds_updated ON public.free_play_rounds;
CREATE TRIGGER trg_free_play_rounds_updated
  BEFORE UPDATE ON public.free_play_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_free_play_round_players_updated ON public.free_play_round_players;
CREATE TRIGGER trg_free_play_round_players_updated
  BEFORE UPDATE ON public.free_play_round_players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_free_play_round_scores_updated ON public.free_play_round_scores;
CREATE TRIGGER trg_free_play_round_scores_updated
  BEFORE UPDATE ON public.free_play_round_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_free_play_round_hole_scores_updated ON public.free_play_round_hole_scores;
CREATE TRIGGER trg_free_play_round_hole_scores_updated
  BEFORE UPDATE ON public.free_play_round_hole_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_free_play_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.free_play_rounds r
    WHERE r.id = p_round_id
      AND (
        r.created_by_user_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.free_play_round_players p
          WHERE p.round_id = r.id
            AND p.user_id = auth.uid()
        )
      )
  );
$$;

ALTER TABLE public.free_play_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_play_round_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_play_round_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_play_round_hole_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (public.can_access_free_play_round(id));

DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
CREATE POLICY free_play_rounds_insert ON public.free_play_rounds
  FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS free_play_rounds_update ON public.free_play_rounds;
CREATE POLICY free_play_rounds_update ON public.free_play_rounds
  FOR UPDATE TO authenticated
  USING (public.can_access_free_play_round(id))
  WITH CHECK (public.can_access_free_play_round(id));

DROP POLICY IF EXISTS free_play_rounds_delete ON public.free_play_rounds;
CREATE POLICY free_play_rounds_delete ON public.free_play_rounds
  FOR DELETE TO authenticated
  USING (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS free_play_round_players_select ON public.free_play_round_players;
CREATE POLICY free_play_round_players_select ON public.free_play_round_players
  FOR SELECT TO authenticated
  USING (public.can_access_free_play_round(round_id));

DROP POLICY IF EXISTS free_play_round_players_insert ON public.free_play_round_players;
CREATE POLICY free_play_round_players_insert ON public.free_play_round_players
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_free_play_round(round_id)
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS free_play_round_players_update ON public.free_play_round_players;
CREATE POLICY free_play_round_players_update ON public.free_play_round_players
  FOR UPDATE TO authenticated
  USING (public.can_access_free_play_round(round_id))
  WITH CHECK (public.can_access_free_play_round(round_id));

DROP POLICY IF EXISTS free_play_round_players_delete ON public.free_play_round_players;
CREATE POLICY free_play_round_players_delete ON public.free_play_round_players
  FOR DELETE TO authenticated
  USING (public.can_access_free_play_round(round_id));

DROP POLICY IF EXISTS free_play_round_scores_select ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_select ON public.free_play_round_scores
  FOR SELECT TO authenticated
  USING (public.can_access_free_play_round(round_id));

DROP POLICY IF EXISTS free_play_round_scores_mutate ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_mutate ON public.free_play_round_scores
  FOR ALL TO authenticated
  USING (public.can_access_free_play_round(round_id))
  WITH CHECK (public.can_access_free_play_round(round_id));

DROP POLICY IF EXISTS free_play_round_hole_scores_select ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_select ON public.free_play_round_hole_scores
  FOR SELECT TO authenticated
  USING (public.can_access_free_play_round(round_id));

DROP POLICY IF EXISTS free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores
  FOR ALL TO authenticated
  USING (public.can_access_free_play_round(round_id))
  WITH CHECK (public.can_access_free_play_round(round_id));

NOTIFY pgrst, 'reload schema';
