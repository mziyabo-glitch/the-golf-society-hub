-- Canonical persistence for entered gross hole scores and derived round totals per player/event.

CREATE TABLE IF NOT EXISTS public.event_player_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  format text NOT NULL CHECK (format IN ('stableford', 'strokeplay_net', 'strokeplay_gross')),
  course_handicap integer,
  playing_handicap integer,
  gross_total integer NOT NULL DEFAULT 0,
  net_total integer NOT NULL DEFAULT 0,
  stableford_points integer NOT NULL DEFAULT 0,
  holes_played integer NOT NULL DEFAULT 0,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_player_rounds_event_player_uniq UNIQUE (event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_event_player_rounds_event_id ON public.event_player_rounds(event_id);
CREATE INDEX IF NOT EXISTS idx_event_player_rounds_player_id ON public.event_player_rounds(player_id);

COMMENT ON TABLE public.event_player_rounds IS
  'Derived round summary per member/event; recalculated whenever gross hole scores are saved. Source of truth is event_player_hole_scores.';

CREATE TABLE IF NOT EXISTS public.event_player_hole_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  hole_number integer NOT NULL,
  gross_strokes integer NOT NULL CHECK (gross_strokes >= 1 AND gross_strokes <= 30),
  net_strokes integer NOT NULL,
  stableford_points integer NOT NULL DEFAULT 0,
  strokes_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_player_hole_scores_event_player_hole_uniq UNIQUE (event_id, player_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_event_player_hole_scores_event_id ON public.event_player_hole_scores(event_id);
CREATE INDEX IF NOT EXISTS idx_event_player_hole_scores_event_player ON public.event_player_hole_scores(event_id, player_id);

COMMENT ON TABLE public.event_player_hole_scores IS
  'Per-hole gross entry and derived fields for an event. Full replace on each save for a player.';

DROP TRIGGER IF EXISTS trg_event_player_rounds_updated ON public.event_player_rounds;
CREATE TRIGGER trg_event_player_rounds_updated
  BEFORE UPDATE ON public.event_player_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_event_player_hole_scores_updated ON public.event_player_hole_scores;
CREATE TRIGGER trg_event_player_hole_scores_updated
  BEFORE UPDATE ON public.event_player_hole_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.event_player_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_player_hole_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_player_rounds_select ON public.event_player_rounds;
CREATE POLICY event_player_rounds_select ON public.event_player_rounds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_rounds.event_id
    )
  );

DROP POLICY IF EXISTS event_player_rounds_insert ON public.event_player_rounds;
CREATE POLICY event_player_rounds_insert ON public.event_player_rounds
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_rounds.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_player_rounds_update ON public.event_player_rounds;
CREATE POLICY event_player_rounds_update ON public.event_player_rounds
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_rounds.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_rounds.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_player_rounds_delete ON public.event_player_rounds;
CREATE POLICY event_player_rounds_delete ON public.event_player_rounds
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_rounds.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_player_hole_scores_select ON public.event_player_hole_scores;
CREATE POLICY event_player_hole_scores_select ON public.event_player_hole_scores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_hole_scores.event_id
    )
  );

DROP POLICY IF EXISTS event_player_hole_scores_insert ON public.event_player_hole_scores;
CREATE POLICY event_player_hole_scores_insert ON public.event_player_hole_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_hole_scores.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_player_hole_scores_update ON public.event_player_hole_scores;
CREATE POLICY event_player_hole_scores_update ON public.event_player_hole_scores
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_hole_scores.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_hole_scores.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

DROP POLICY IF EXISTS event_player_hole_scores_delete ON public.event_player_hole_scores;
CREATE POLICY event_player_hole_scores_delete ON public.event_player_hole_scores
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.members m ON m.society_id = e.society_id AND m.user_id = auth.uid()
      WHERE e.id = event_player_hole_scores.event_id
        AND UPPER(COALESCE(m.role, '')) IN ('CAPTAIN', 'SECRETARY', 'HANDICAPPER')
    )
  );

NOTIFY pgrst, 'reload schema';
