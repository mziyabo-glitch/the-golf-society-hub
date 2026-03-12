-- 050_event_guests.sql
-- Guest players for events (name, sex, handicap index).
-- Allows captains to add non-members to events and include them in the tee sheet.

CREATE TABLE IF NOT EXISTS public.event_guests (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id           uuid        NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  event_id             uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name                 text        NOT NULL,
  sex                  text        NOT NULL CHECK (sex IN ('male', 'female')),
  handicap_index       numeric(4,1),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_guests_event   ON public.event_guests (event_id);
CREATE INDEX IF NOT EXISTS idx_event_guests_society ON public.event_guests (society_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_event_guests_updated_at ON public.event_guests;
CREATE TRIGGER trg_event_guests_updated_at
  BEFORE UPDATE ON public.event_guests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_guests_select ON public.event_guests;
DROP POLICY IF EXISTS event_guests_insert ON public.event_guests;
DROP POLICY IF EXISTS event_guests_update ON public.event_guests;
DROP POLICY IF EXISTS event_guests_delete ON public.event_guests;

CREATE POLICY event_guests_select
  ON public.event_guests FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
  ));

-- Captain/Secretary/Handicapper can manage guests (same as canEditEvents)
CREATE POLICY event_guests_insert
  ON public.event_guests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
      AND upper(coalesce(m.role,'')) IN ('CAPTAIN','SECRETARY','HANDICAPPER')
  ));

CREATE POLICY event_guests_update
  ON public.event_guests FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
      AND upper(coalesce(m.role,'')) IN ('CAPTAIN','SECRETARY','HANDICAPPER')
  ));

CREATE POLICY event_guests_delete
  ON public.event_guests FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.members m
    WHERE m.user_id = auth.uid() AND m.society_id = event_guests.society_id
      AND upper(coalesce(m.role,'')) IN ('CAPTAIN','SECRETARY','HANDICAPPER')
  ));
