-- Optional rivalry metadata for edit UI: scoring style and end date.
-- RLS unchanged: sinbooks_update already allows creator or accepted participant.

ALTER TABLE public.sinbooks
  ADD COLUMN IF NOT EXISTS scoring_format text,
  ADD COLUMN IF NOT EXISTS ends_on date;

COMMENT ON COLUMN public.sinbooks.scoring_format IS 'Optional label e.g. matchplay, gross, net (display only).';
COMMENT ON COLUMN public.sinbooks.ends_on IS 'Optional rivalry end date (calendar date).';
