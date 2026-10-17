-- 096_event_guests_paid_status.sql
-- Allow guest fee tracking so guests can appear in paid/unpaid admin and share views.

ALTER TABLE public.event_guests
  ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_guests.paid IS
  'Guest fee state for event admin views and payment sharing. Paid guests are treated as confirmed attendees.';

CREATE INDEX IF NOT EXISTS idx_event_guests_event_paid
  ON public.event_guests (event_id, paid);

NOTIFY pgrst, 'reload schema';
