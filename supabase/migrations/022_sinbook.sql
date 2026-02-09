-- =====================================================
-- MIGRATION 022: Sinbook — Rivalry / Side-Bet Tracker
-- =====================================================
-- Tables: sinbooks, sinbook_participants, sinbook_entries, sinbook_notifications
-- Both accepted participants have full shared edit rights via RLS.
-- Sinbook is per-user (auth.uid()), NOT per-society.
--
-- ORDER: 1) All tables  2) Helper function  3) All RLS policies  4) Indexes
-- =====================================================

-- =====================================================
-- 1) CREATE ALL TABLES FIRST (no RLS yet)
-- =====================================================

-- 1a) SINBOOKS (the rivalry itself)
CREATE TABLE IF NOT EXISTS public.sinbooks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  stake         text,                        -- e.g. "Loser buys dinner", no £ amounts
  season        text,                        -- e.g. "2026", optional for season-long
  is_private    boolean NOT NULL DEFAULT false,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 1b) SINBOOK_PARTICIPANTS (who is in the rivalry)
CREATE TABLE IF NOT EXISTS public.sinbook_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sinbook_id    uuid NOT NULL REFERENCES public.sinbooks(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  display_name  text NOT NULL DEFAULT 'Player',
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by    uuid REFERENCES auth.users(id),
  joined_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sinbook_id, user_id)
);

-- 1c) SINBOOK_ENTRIES (the timeline / ledger)
CREATE TABLE IF NOT EXISTS public.sinbook_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sinbook_id    uuid NOT NULL REFERENCES public.sinbooks(id) ON DELETE CASCADE,
  added_by      uuid NOT NULL REFERENCES auth.users(id),
  description   text NOT NULL,            -- e.g. "Closest to pin on 7th"
  winner_id     uuid REFERENCES auth.users(id),  -- who won this entry (null = no winner yet)
  entry_date    date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 1d) SINBOOK_NOTIFICATIONS (in-app only)
CREATE TABLE IF NOT EXISTS public.sinbook_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id),
  sinbook_id    uuid NOT NULL REFERENCES public.sinbooks(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN (
    'invite', 'accepted', 'entry_added', 'entry_edited', 'entry_deleted'
  )),
  title         text NOT NULL,
  body          text,
  is_read       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- 2) HELPER FUNCTION (tables exist now)
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_sinbook_participant(_sinbook_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sinbook_participants
    WHERE sinbook_id = _sinbook_id
      AND user_id = auth.uid()
      AND status = 'accepted'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_sinbook_participant(uuid) TO authenticated;

-- =====================================================
-- 3) ENABLE RLS + POLICIES (function + tables all exist)
-- =====================================================

-- 3a) sinbooks
ALTER TABLE public.sinbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY sinbooks_select ON public.sinbooks
  FOR SELECT TO authenticated
  USING (public.is_sinbook_participant(id) OR created_by = auth.uid());

CREATE POLICY sinbooks_insert ON public.sinbooks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY sinbooks_update ON public.sinbooks
  FOR UPDATE TO authenticated
  USING (public.is_sinbook_participant(id));

CREATE POLICY sinbooks_delete ON public.sinbooks
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- 3b) sinbook_participants
ALTER TABLE public.sinbook_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY sinbook_participants_select ON public.sinbook_participants
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_sinbook_participant(sinbook_id)
  );

CREATE POLICY sinbook_participants_insert ON public.sinbook_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sinbooks
      WHERE id = sinbook_id AND created_by = auth.uid()
    )
  );

CREATE POLICY sinbook_participants_update ON public.sinbook_participants
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_sinbook_participant(sinbook_id)
  );

CREATE POLICY sinbook_participants_delete ON public.sinbook_participants
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sinbooks
      WHERE id = sinbook_id AND created_by = auth.uid()
    )
  );

-- 3c) sinbook_entries
ALTER TABLE public.sinbook_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY sinbook_entries_select ON public.sinbook_entries
  FOR SELECT TO authenticated
  USING (public.is_sinbook_participant(sinbook_id));

CREATE POLICY sinbook_entries_insert ON public.sinbook_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    added_by = auth.uid()
    AND public.is_sinbook_participant(sinbook_id)
  );

CREATE POLICY sinbook_entries_update ON public.sinbook_entries
  FOR UPDATE TO authenticated
  USING (public.is_sinbook_participant(sinbook_id));

CREATE POLICY sinbook_entries_delete ON public.sinbook_entries
  FOR DELETE TO authenticated
  USING (public.is_sinbook_participant(sinbook_id));

-- 3d) sinbook_notifications
ALTER TABLE public.sinbook_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY sinbook_notifications_select ON public.sinbook_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY sinbook_notifications_insert ON public.sinbook_notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY sinbook_notifications_update ON public.sinbook_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY sinbook_notifications_delete ON public.sinbook_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- 4) INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sinbook_participants_user ON public.sinbook_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_sinbook_participants_sinbook ON public.sinbook_participants(sinbook_id);
CREATE INDEX IF NOT EXISTS idx_sinbook_entries_sinbook ON public.sinbook_entries(sinbook_id);
CREATE INDEX IF NOT EXISTS idx_sinbook_notifications_user ON public.sinbook_notifications(user_id, is_read);
