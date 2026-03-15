-- Add Blue tee to Shrivenham Park canonical course (55516ba0-f6e6-4709-9115-9a95b78b1de2)
-- Blue is a winter/alternate tee at Shrivenham; was previously manual-only on events.

INSERT INTO public.course_tees (
  course_id,
  tee_name,
  course_rating,
  slope_rating,
  par_total,
  gender
) VALUES (
  '55516ba0-f6e6-4709-9115-9a95b78b1de2',
  'Blue',
  70.0,
  125,
  72,
  NULL
)
ON CONFLICT (course_id, tee_name) DO NOTHING;
