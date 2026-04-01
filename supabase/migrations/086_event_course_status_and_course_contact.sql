-- Event-level course status (member-reported after calling the course)
-- Optional course contact fields for phone / website

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS website_url text;

CREATE TABLE IF NOT EXISTS public.event_course_status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('open', 'restricted', 'temp_greens', 'closed')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_course_status_event ON public.event_course_status_updates(event_id);
CREATE INDEX IF NOT EXISTS idx_event_course_status_created ON public.event_course_status_updates(event_id, created_at DESC);

ALTER TABLE public.event_course_status_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_course_status_updates_select ON public.event_course_status_updates;
DROP POLICY IF EXISTS event_course_status_updates_insert ON public.event_course_status_updates;

-- Same visibility as events row: host society member or linked joint participant
CREATE POLICY event_course_status_updates_select
  ON public.event_course_status_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_course_status_updates.event_id
        AND (
          e.society_id IN (SELECT public.my_society_ids())
          OR public.current_user_linked_to_event(e.id)
        )
    )
  );

CREATE POLICY event_course_status_updates_insert
  ON public.event_course_status_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = event_course_status_updates.member_id
        AND m.user_id = auth.uid()
        AND m.society_id = event_course_status_updates.society_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = event_course_status_updates.event_id
        AND (
          e.society_id IN (SELECT public.my_society_ids())
          OR public.current_user_linked_to_event(e.id)
        )
    )
  );
