-- 023: Add tee time publish fields to events
-- When ManCo shares a tee sheet, persist the start time + interval
-- and record when it was published so the home page can display it.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS tee_time_start text,
  ADD COLUMN IF NOT EXISTS tee_time_interval integer,
  ADD COLUMN IF NOT EXISTS tee_time_published_at timestamptz;
