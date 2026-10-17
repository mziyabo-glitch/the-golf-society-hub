-- Free Play Scorecard v1: competition format, per-player tee/PH, hole score NR (pickup), RLS hardening, safe join-by-code.

-- ---------------------------------------------------------------------------
-- 1) Schema: rounds — scoring_format (stroke_net | stableford)
-- ---------------------------------------------------------------------------
ALTER TABLE public.free_play_rounds
  ADD COLUMN IF NOT EXISTS scoring_format text;

UPDATE public.free_play_rounds
SET scoring_format = 'stroke_net'
WHERE scoring_format IS NULL;

ALTER TABLE public.free_play_rounds
  ALTER COLUMN scoring_format SET DEFAULT 'stroke_net';

ALTER TABLE public.free_play_rounds
  DROP CONSTRAINT IF EXISTS free_play_rounds_scoring_format_chk;

ALTER TABLE public.free_play_rounds
  ADD CONSTRAINT free_play_rounds_scoring_format_chk
  CHECK (scoring_format IN ('stroke_net', 'stableford'));

ALTER TABLE public.free_play_rounds
  ALTER COLUMN scoring_format SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_free_play_rounds_scoring_format
  ON public.free_play_rounds(scoring_format);

-- ---------------------------------------------------------------------------
-- 2) Schema: players — guest_name, playing_handicap, per-player tee
-- ---------------------------------------------------------------------------
ALTER TABLE public.free_play_round_players
  ADD COLUMN IF NOT EXISTS guest_name text,
  ADD COLUMN IF NOT EXISTS playing_handicap numeric(5, 1),
  ADD COLUMN IF NOT EXISTS tee_id uuid REFERENCES public.course_tees(id) ON DELETE SET NULL;

UPDATE public.free_play_round_players p
SET playing_handicap = COALESCE(p.playing_handicap, p.handicap_index)
WHERE p.playing_handicap IS NULL;

UPDATE public.free_play_round_players p
SET guest_name = NULL
WHERE p.guest_name IS NOT NULL AND btrim(p.guest_name) = '';

CREATE INDEX IF NOT EXISTS idx_free_play_round_players_tee_id
  ON public.free_play_round_players(tee_id);

-- ---------------------------------------------------------------------------
-- 3) Schema: hole scores — allow NULL gross for pickup / NR (no stroke recorded)
-- ---------------------------------------------------------------------------
ALTER TABLE public.free_play_round_hole_scores
  DROP CONSTRAINT IF EXISTS free_play_round_hole_scores_gross_strokes_check;

ALTER TABLE public.free_play_round_hole_scores
  ALTER COLUMN gross_strokes DROP NOT NULL;

ALTER TABLE public.free_play_round_hole_scores
  ADD CONSTRAINT free_play_round_hole_scores_gross_strokes_chk
  CHECK (gross_strokes IS NULL OR (gross_strokes >= 1 AND gross_strokes <= 30));

-- ---------------------------------------------------------------------------
-- 4) RLS helpers: read vs manage vs society roster visibility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.free_play_can_read_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.free_play_rounds r
      WHERE r.id = p_round_id
        AND r.created_by_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      WHERE p.round_id = p_round_id
        AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.free_play_round_players p
      JOIN public.members m ON m.id = p.member_id
      JOIN public.free_play_rounds r ON r.id = p.round_id
      WHERE p.round_id = p_round_id
        AND m.user_id = auth.uid()
        AND r.society_id IS NOT NULL
        AND m.society_id = r.society_id
    );
$$;

CREATE OR REPLACE FUNCTION public.free_play_can_manage_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.free_play_rounds r
    WHERE r.id = p_round_id
      AND r.created_by_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.free_play_can_read_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.free_play_can_manage_round(uuid) TO authenticated;

-- Replace public access helper used by policies
CREATE OR REPLACE FUNCTION public.free_play_can_access_round(p_round_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.free_play_can_read_round(p_round_id);
$$;

-- ---------------------------------------------------------------------------
-- 5) Policies: SELECT = read; INSERT/UPDATE/DELETE scores & players = manage only;
--    rounds INSERT = creator + society membership when society_id set
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS free_play_rounds_select ON public.free_play_rounds;
CREATE POLICY free_play_rounds_select ON public.free_play_rounds
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(id));

DROP POLICY IF EXISTS free_play_rounds_insert ON public.free_play_rounds;
CREATE POLICY free_play_rounds_insert ON public.free_play_rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND (
      society_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.society_id = society_id
          AND m.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS free_play_rounds_update ON public.free_play_rounds;
CREATE POLICY free_play_rounds_update ON public.free_play_rounds
  FOR UPDATE TO authenticated
  USING (public.free_play_can_manage_round(id))
  WITH CHECK (public.free_play_can_manage_round(id));

DROP POLICY IF EXISTS free_play_rounds_delete ON public.free_play_rounds;
CREATE POLICY free_play_rounds_delete ON public.free_play_rounds
  FOR DELETE TO authenticated
  USING (public.free_play_can_manage_round(id));

DROP POLICY IF EXISTS free_play_round_players_select ON public.free_play_round_players;
CREATE POLICY free_play_round_players_select ON public.free_play_round_players
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(round_id));

DROP POLICY IF EXISTS free_play_round_players_insert ON public.free_play_round_players;
CREATE POLICY free_play_round_players_insert ON public.free_play_round_players
  FOR INSERT TO authenticated
  WITH CHECK (public.free_play_can_manage_round(round_id));

DROP POLICY IF EXISTS free_play_round_players_update ON public.free_play_round_players;
CREATE POLICY free_play_round_players_update ON public.free_play_round_players
  FOR UPDATE TO authenticated
  USING (public.free_play_can_manage_round(round_id))
  WITH CHECK (public.free_play_can_manage_round(round_id));

DROP POLICY IF EXISTS free_play_round_players_delete ON public.free_play_round_players;
CREATE POLICY free_play_round_players_delete ON public.free_play_round_players
  FOR DELETE TO authenticated
  USING (public.free_play_can_manage_round(round_id));

DROP POLICY IF EXISTS free_play_round_scores_select ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_select ON public.free_play_round_scores
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(round_id));

DROP POLICY IF EXISTS free_play_round_scores_mutate ON public.free_play_round_scores;
CREATE POLICY free_play_round_scores_mutate ON public.free_play_round_scores
  FOR ALL TO authenticated
  USING (public.free_play_can_manage_round(round_id))
  WITH CHECK (public.free_play_can_manage_round(round_id));

DROP POLICY IF EXISTS free_play_round_hole_scores_select ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_select ON public.free_play_round_hole_scores
  FOR SELECT TO authenticated
  USING (public.free_play_can_read_round(round_id));

DROP POLICY IF EXISTS free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores;
CREATE POLICY free_play_round_hole_scores_mutate ON public.free_play_round_hole_scores
  FOR ALL TO authenticated
  USING (public.free_play_can_manage_round(round_id))
  WITH CHECK (public.free_play_can_manage_round(round_id));

-- ---------------------------------------------------------------------------
-- 6) Join by code (RPC): avoids open INSERT self-join abuse
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_free_play_round_by_code(p_join_code text, p_display_name text)
RETURNS public.free_play_rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(btrim(p_join_code));
  r public.free_play_rounds%ROWTYPE;
  v_name text := btrim(coalesce(p_display_name, ''));
BEGIN
  IF v_code IS NULL OR length(v_code) < 4 THEN
    RAISE EXCEPTION 'invalid_join_code';
  END IF;

  SELECT * INTO r
  FROM public.free_play_rounds
  WHERE upper(btrim(join_code)) = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'round_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.free_play_round_players p
    WHERE p.round_id = r.id AND p.user_id = auth.uid()
  ) THEN
    RETURN r;
  END IF;

  INSERT INTO public.free_play_round_players (
    round_id,
    player_type,
    member_id,
    user_id,
    invite_email,
    display_name,
    handicap_index,
    playing_handicap,
    guest_name,
    tee_id,
    invite_status,
    is_owner,
    sort_order
  ) VALUES (
    r.id,
    'app_user',
    NULL,
    auth.uid(),
    NULL,
    CASE WHEN length(v_name) > 0 THEN left(v_name, 120) ELSE 'Player' END,
    0,
    0,
    NULL,
    NULL,
    'joined',
    false,
    (SELECT coalesce(max(sort_order), -1) + 1 FROM public.free_play_round_players WHERE round_id = r.id)
  );

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.join_free_play_round_by_code(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_free_play_round_by_code(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
