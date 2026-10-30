-- Correct Lake course ladies' WHS tee ratings (source: Vale Resort handicap calculator, 2025–2026).
-- White (Ladies) uses WHS par 73; other ladies tees use par 74.

UPDATE public.course_tees ct
SET
  course_rating = v.course_rating,
  slope_rating = v.slope_rating,
  par_total = v.par_total,
  sync_status = 'ok'
FROM public.courses c
CROSS JOIN LATERAL (
  VALUES
    ('White (Ladies)', 77.4::double precision, 137, 73),
    ('Yellow (Ladies)', 76.6::double precision, 136, 74),
    ('Winter Yellow (Ladies)', 75.1::double precision, 135, 74),
    ('Winter Red (Ladies)', 74.2::double precision, 133, 74),
    ('Red (Ladies)', 74.9::double precision, 134, 74)
) AS v(tee_name, course_rating, slope_rating, par_total)
WHERE ct.course_id = c.id
  AND ct.tee_name = v.tee_name
  AND ct.gender = 'F'
  AND lower(replace(replace(c.course_name, '–', '-'), '  ', ' ')) IN (
    'vale resort - lake course',
    'the vale resort - lake course'
  );
