-- Correct WHS tee ratings for The Vale Resort (Wales National + Lake courses).
-- Canonical ratings live in lib/course/valeResortTeeRatings.ts and scripts/seed-vale-resort.ts.
-- This migration updates existing course_tees rows (including official_pdf duplicates) by tee name.

-- Wales National: par 73 for all men's tees
UPDATE public.course_tees ct
SET
  course_rating = v.course_rating,
  slope_rating = v.slope_rating,
  par_total = 73,
  gender = 'M',
  is_active = true,
  sync_status = 'ok'
FROM public.courses c,
LATERAL (
  VALUES
    ('Blue', 77.3::double precision, 134),
    ('White', 75.2::double precision, 130),
    ('Yellow', 73.5::double precision, 126),
    ('Red', 69.1::double precision, 119)
) AS v(tee_name, course_rating, slope_rating)
WHERE ct.course_id = c.id
  AND ct.tee_name = v.tee_name
  AND lower(replace(replace(c.course_name, '–', '-'), '  ', ' ')) IN (
    'vale resort - wales national course',
    'the vale resort - wales national course'
  );

-- Lake course: par 72 for all men's tees
UPDATE public.course_tees ct
SET
  course_rating = v.course_rating,
  slope_rating = v.slope_rating,
  par_total = 72,
  gender = 'M',
  is_active = true,
  sync_status = 'ok'
FROM public.courses c,
LATERAL (
  VALUES
    ('White', 71.9::double precision, 130),
    ('Yellow', 70.3::double precision, 123),
    ('Winter Yellow', 68.6::double precision, 122),
    ('Winter Red', 67.8::double precision, 121),
    ('Red', 69.0::double precision, 120)
) AS v(tee_name, course_rating, slope_rating)
WHERE ct.course_id = c.id
  AND ct.tee_name = v.tee_name
  AND lower(replace(replace(c.course_name, '–', '-'), '  ', ' ')) IN (
    'vale resort - lake course',
    'the vale resort - lake course'
  );

-- Mark manual_seed Vale courses as verified for event pickers
UPDATE public.courses
SET golfer_data_status = 'verified', validation_basis = 'official_only'
WHERE dedupe_key IN (
  'manual_seed:vale-resort-lake-course',
  'manual_seed:vale-resort-wales-national-course'
);
