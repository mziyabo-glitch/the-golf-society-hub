-- Immutable tee metrics at lock-in time for scoring / WHS. Live `course_tees` may change on re-import.

ALTER TABLE public.event_courses ADD COLUMN IF NOT EXISTS tee_name text;
ALTER TABLE public.event_courses ADD COLUMN IF NOT EXISTS course_rating double precision;
ALTER TABLE public.event_courses ADD COLUMN IF NOT EXISTS slope_rating integer;
ALTER TABLE public.event_courses ADD COLUMN IF NOT EXISTS par_total integer;

COMMENT ON COLUMN public.event_courses.tee_name IS 'Snapshot: tee name when event locked to this tee; not updated if course is re-imported.';
COMMENT ON COLUMN public.event_courses.course_rating IS 'Snapshot: course rating for WHS / course handicap at lock-in.';
COMMENT ON COLUMN public.event_courses.slope_rating IS 'Snapshot: slope rating at lock-in.';
COMMENT ON COLUMN public.event_courses.par_total IS 'Snapshot: par for rated tee at lock-in.';

NOTIFY pgrst, 'reload schema';
