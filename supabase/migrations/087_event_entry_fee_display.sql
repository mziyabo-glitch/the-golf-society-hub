-- Optional member-facing entry fee label (e.g. £45, £55 incl. food). ManCo create/edit; shown on dashboard & event detail.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS entry_fee_display text NULL;

COMMENT ON COLUMN public.events.entry_fee_display IS 'Optional display string for event entry fee; not validated as currency.';
