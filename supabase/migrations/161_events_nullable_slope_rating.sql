-- Allow events (and snapshots) without WHS slope — e.g. Meon Valley official scorecard fallback.
-- Reject 0 and out-of-range values; NULL means slope not published for that tee.

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_slope_rating_check;
ALTER TABLE public.events ADD CONSTRAINT events_slope_rating_check
  CHECK (slope_rating IS NULL OR slope_rating BETWEEN 55 AND 155);

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_ladies_slope_rating_check;
ALTER TABLE public.events ADD CONSTRAINT events_ladies_slope_rating_check
  CHECK (ladies_slope_rating IS NULL OR ladies_slope_rating BETWEEN 55 AND 155);

ALTER TABLE public.event_courses DROP CONSTRAINT IF EXISTS event_courses_slope_rating_check;
ALTER TABLE public.event_courses ADD CONSTRAINT event_courses_slope_rating_check
  CHECK (slope_rating IS NULL OR slope_rating BETWEEN 55 AND 155);
