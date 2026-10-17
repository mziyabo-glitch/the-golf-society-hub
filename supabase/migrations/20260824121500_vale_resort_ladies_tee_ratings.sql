-- Ladies' WHS tee ratings for The Vale Resort (canonical data in lib/course/valeResortTeeRatings.ts).
-- Ladies rows use tee_name suffix "(Ladies)" — unique per course_id alongside men's tees.

-- Wales National ladies tees (WHS par 75)
INSERT INTO public.course_tees (
  course_id, tee_name, par_total, course_rating, slope_rating, gender, yards, is_active, source_type, sync_status, confidence_score, display_order
)
SELECT
  c.id,
  v.tee_name,
  75,
  v.course_rating,
  v.slope_rating,
  'F',
  src.yards,
  true,
  c.source_type,
  'ok',
  100,
  v.display_order
FROM public.courses c
CROSS JOIN LATERAL (
  VALUES
    ('Blue (Ladies)', 83.9::double precision, 154, 10),
    ('White (Ladies)', 81.5::double precision, 151, 11),
    ('Yellow (Ladies)', 79.4::double precision, 146, 12),
    ('Red (Ladies)', 75.7::double precision, 130, 13)
) AS v(tee_name, course_rating, slope_rating, display_order)
JOIN public.course_tees src
  ON src.course_id = c.id
 AND src.tee_name = replace(v.tee_name, ' (Ladies)', '')
 AND src.gender = 'M'
WHERE lower(replace(replace(c.course_name, '–', '-'), '  ', ' ')) IN (
  'vale resort - wales national course',
  'the vale resort - wales national course'
)
ON CONFLICT (course_id, tee_name) DO UPDATE SET
  course_rating = EXCLUDED.course_rating,
  slope_rating = EXCLUDED.slope_rating,
  par_total = EXCLUDED.par_total,
  gender = 'F',
  yards = EXCLUDED.yards,
  is_active = true,
  sync_status = 'ok';

-- Lake course ladies tees (WHS par 74)
INSERT INTO public.course_tees (
  course_id, tee_name, par_total, course_rating, slope_rating, gender, yards, is_active, source_type, sync_status, confidence_score, display_order
)
SELECT
  c.id,
  v.tee_name,
  74,
  v.course_rating,
  v.slope_rating,
  'F',
  src.yards,
  true,
  c.source_type,
  'ok',
  100,
  v.display_order
FROM public.courses c
CROSS JOIN LATERAL (
  VALUES
    ('White (Ladies)', 78.7::double precision, 140, 10),
    ('Yellow (Ladies)', 76.6::double precision, 136, 11),
    ('Winter Yellow (Ladies)', 74.9::double precision, 135, 12),
    ('Winter Red (Ladies)', 74.2::double precision, 133, 13),
    ('Red (Ladies)', 74.9::double precision, 134, 14)
) AS v(tee_name, course_rating, slope_rating, display_order)
JOIN public.course_tees src
  ON src.course_id = c.id
 AND src.tee_name = replace(v.tee_name, ' (Ladies)', '')
 AND src.gender = 'M'
WHERE lower(replace(replace(c.course_name, '–', '-'), '  ', ' ')) IN (
  'vale resort - lake course',
  'the vale resort - lake course'
)
ON CONFLICT (course_id, tee_name) DO UPDATE SET
  course_rating = EXCLUDED.course_rating,
  slope_rating = EXCLUDED.slope_rating,
  par_total = EXCLUDED.par_total,
  gender = 'F',
  yards = EXCLUDED.yards,
  is_active = true,
  sync_status = 'ok';

-- Copy hole layouts from matching men's tee to each ladies tee
INSERT INTO public.course_holes (
  course_id, tee_id, hole_number, par, stroke_index, yardage, source_type, sync_status, confidence_score
)
SELECT
  ladies.course_id,
  ladies.id,
  ch.hole_number,
  ch.par,
  ch.stroke_index,
  ch.yardage,
  ladies.source_type,
  'ok',
  100
FROM public.course_tees ladies
JOIN public.course_tees men
  ON men.course_id = ladies.course_id
 AND ladies.tee_name = men.tee_name || ' (Ladies)'
 AND men.gender = 'M'
JOIN public.course_holes ch ON ch.tee_id = men.id
JOIN public.courses c ON c.id = ladies.course_id
WHERE ladies.gender = 'F'
  AND lower(replace(replace(c.course_name, '–', '-'), '  ', ' ')) IN (
    'vale resort - wales national course',
    'the vale resort - wales national course',
    'vale resort - lake course',
    'the vale resort - lake course'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.course_holes existing WHERE existing.tee_id = ladies.id LIMIT 1
  );
