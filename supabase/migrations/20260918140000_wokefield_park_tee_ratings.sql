-- De Vere Wokefield Park WHS tee ratings (lib/course/wokefieldParkTeeRatings.ts).

-- Men's Black (confirm authoritative values)
UPDATE public.course_tees ct
SET course_rating = 69, slope_rating = 123, par_total = 72, sync_status = 'ok'
FROM public.courses c
WHERE ct.course_id = c.id
  AND lower(replace(c.course_name, '–', '-')) = 'wokefield park'
  AND ct.tee_name = 'Black'
  AND ct.gender = 'M';

-- Women's Black (Ladies)
INSERT INTO public.course_tees (
  course_id, tee_name, par_total, course_rating, slope_rating, gender, yards, is_active, source_type, sync_status, confidence_score, display_order
)
SELECT
  c.id,
  'Black (Ladies)',
  73,
  74.6::double precision,
  129,
  'F',
  src.yards,
  true,
  c.source_type,
  'ok',
  100,
  20
FROM public.courses c
JOIN public.course_tees src
  ON src.course_id = c.id AND src.tee_name = 'Black' AND src.gender = 'M'
WHERE lower(replace(c.course_name, '–', '-')) = 'wokefield park'
ON CONFLICT (course_id, tee_name) DO UPDATE SET
  course_rating = EXCLUDED.course_rating,
  slope_rating = EXCLUDED.slope_rating,
  par_total = EXCLUDED.par_total,
  gender = 'F',
  is_active = true,
  sync_status = 'ok';

-- Women's Red (Ladies)
UPDATE public.course_tees ct
SET course_rating = 72.5, slope_rating = 125, par_total = 73, gender = 'F', sync_status = 'ok'
FROM public.courses c
WHERE ct.course_id = c.id
  AND lower(replace(c.course_name, '–', '-')) = 'wokefield park'
  AND ct.tee_name = 'Red (Ladies)';

-- Deactivate duplicate bare "Red" female row (no holes; app uses "(Ladies)" suffix)
UPDATE public.course_tees ct
SET is_active = false, sync_status = 'ok'
FROM public.courses c
WHERE ct.course_id = c.id
  AND lower(replace(c.course_name, '–', '-')) = 'wokefield park'
  AND ct.tee_name = 'Red'
  AND ct.gender = 'F';

-- Hole layout for Black (Ladies) from men's Black
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
  ON men.course_id = ladies.course_id AND men.tee_name = 'Black' AND men.gender = 'M'
JOIN public.course_holes ch ON ch.tee_id = men.id
JOIN public.courses c ON c.id = ladies.course_id
WHERE ladies.tee_name = 'Black (Ladies)'
  AND ladies.gender = 'F'
  AND lower(replace(c.course_name, '–', '-')) = 'wokefield park'
  AND NOT EXISTS (
    SELECT 1 FROM public.course_holes existing WHERE existing.tee_id = ladies.id LIMIT 1
  );
