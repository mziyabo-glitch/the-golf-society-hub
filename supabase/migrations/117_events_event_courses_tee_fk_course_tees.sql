-- Legacy deployments may reference public.tees for events.tee_id / event_courses.tee_id.
-- GolfCourseAPI import uses public.course_tees; repoint FKs so imported tee UUIDs validate.

UPDATE public.events e
SET tee_id = NULL
WHERE tee_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.course_tees ct WHERE ct.id = e.tee_id);

DELETE FROM public.event_courses ec
WHERE NOT EXISTS (SELECT 1 FROM public.course_tees ct WHERE ct.id = ec.tee_id);

ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_tee_id_fkey;

ALTER TABLE public.events
  ADD CONSTRAINT events_tee_id_fkey
  FOREIGN KEY (tee_id) REFERENCES public.course_tees(id) ON DELETE SET NULL;

ALTER TABLE public.event_courses DROP CONSTRAINT IF EXISTS event_courses_tee_id_fkey;

ALTER TABLE public.event_courses
  ADD CONSTRAINT event_courses_tee_id_fkey
  FOREIGN KEY (tee_id) REFERENCES public.course_tees(id) ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';
