-- Read-only audit: strict "scorecard-ready" definition (same active tee as app audit script).
-- Live Free Play search uses migration `156_free_play_scorecard_ready_search.sql` (RPC `free_play_search_scorecard_ready_courses`) with the same rules + duplicate-name exclusion.
-- Active tee: is_active IS NOT FALSE (NULL treated as active).
-- Same tee must have: course_rating, slope_rating, par_total all > 0;
-- holes 1–18 each present once with par > 0;
-- stroke_index integer in 1..18 on every hole 1–18, and 18 distinct values (full permutation).
--
-- Run in Supabase SQL editor or psql against the live project.

-- 1) Course count with at least one strict-ready active rated tee
WITH active_rated_tees AS (
  SELECT id AS tee_id, course_id
  FROM public.course_tees
  WHERE is_active IS NOT FALSE
    AND course_rating IS NOT NULL AND course_rating::numeric > 0
    AND slope_rating IS NOT NULL AND slope_rating::numeric > 0
    AND par_total IS NOT NULL AND par_total::numeric > 0
),
hole_stats AS (
  SELECT
    h.tee_id,
    COUNT(*) FILTER (WHERE h.hole_number BETWEEN 1 AND 18) AS rows_1_18,
    COUNT(DISTINCT h.hole_number) FILTER (WHERE h.hole_number BETWEEN 1 AND 18) AS distinct_hole_nums,
    COUNT(*) FILTER (WHERE h.hole_number BETWEEN 1 AND 18 AND h.par IS NOT NULL AND h.par > 0) AS holes_par_ok,
    COUNT(*) FILTER (
      WHERE h.hole_number BETWEEN 1 AND 18
        AND h.stroke_index IS NOT NULL
        AND h.stroke_index::numeric = FLOOR(h.stroke_index::numeric)
        AND h.stroke_index >= 1 AND h.stroke_index <= 18
    ) AS holes_si_in_range_int,
    COUNT(DISTINCT h.stroke_index) FILTER (
      WHERE h.hole_number BETWEEN 1 AND 18
        AND h.stroke_index IS NOT NULL
        AND h.stroke_index::numeric = FLOOR(h.stroke_index::numeric)
        AND h.stroke_index >= 1 AND h.stroke_index <= 18
    ) AS distinct_si_in_range
  FROM public.course_holes h
  INNER JOIN active_rated_tees t ON t.tee_id = h.tee_id
  GROUP BY h.tee_id
),
strict_tees AS (
  SELECT art.tee_id, art.course_id
  FROM active_rated_tees art
  INNER JOIN hole_stats hs ON hs.tee_id = art.tee_id
  WHERE hs.rows_1_18 = 18
    AND hs.distinct_hole_nums = 18
    AND hs.holes_par_ok = 18
    AND hs.holes_si_in_range_int = 18
    AND hs.distinct_si_in_range = 18
)
SELECT COUNT(DISTINCT course_id) AS strict_scorecard_ready_count
FROM strict_tees;

-- 2) List strict-ready courses (id, optional join to name)
-- WITH clauses repeated for standalone paste (same as above)
WITH active_rated_tees AS (
  SELECT id AS tee_id, course_id
  FROM public.course_tees
  WHERE is_active IS NOT FALSE
    AND course_rating IS NOT NULL AND course_rating::numeric > 0
    AND slope_rating IS NOT NULL AND slope_rating::numeric > 0
    AND par_total IS NOT NULL AND par_total::numeric > 0
),
hole_stats AS (
  SELECT
    h.tee_id,
    COUNT(*) FILTER (WHERE h.hole_number BETWEEN 1 AND 18) AS rows_1_18,
    COUNT(DISTINCT h.hole_number) FILTER (WHERE h.hole_number BETWEEN 1 AND 18) AS distinct_hole_nums,
    COUNT(*) FILTER (WHERE h.hole_number BETWEEN 1 AND 18 AND h.par IS NOT NULL AND h.par > 0) AS holes_par_ok,
    COUNT(*) FILTER (
      WHERE h.hole_number BETWEEN 1 AND 18
        AND h.stroke_index IS NOT NULL
        AND h.stroke_index::numeric = FLOOR(h.stroke_index::numeric)
        AND h.stroke_index >= 1 AND h.stroke_index <= 18
    ) AS holes_si_in_range_int,
    COUNT(DISTINCT h.stroke_index) FILTER (
      WHERE h.hole_number BETWEEN 1 AND 18
        AND h.stroke_index IS NOT NULL
        AND h.stroke_index::numeric = FLOOR(h.stroke_index::numeric)
        AND h.stroke_index >= 1 AND h.stroke_index <= 18
    ) AS distinct_si_in_range
  FROM public.course_holes h
  INNER JOIN active_rated_tees t ON t.tee_id = h.tee_id
  GROUP BY h.tee_id
),
strict_course_ids AS (
  SELECT DISTINCT art.course_id
  FROM active_rated_tees art
  INNER JOIN hole_stats hs ON hs.tee_id = art.tee_id
  WHERE hs.rows_1_18 = 18
    AND hs.distinct_hole_nums = 18
    AND hs.holes_par_ok = 18
    AND hs.holes_si_in_range_int = 18
    AND hs.distinct_si_in_range = 18
)
SELECT c.id, NULLIF(trim(c.course_name), '') AS course_name, NULLIF(trim(c.club_name), '') AS club_name, c.territory
FROM public.courses c
INNER JOIN strict_course_ids s ON s.course_id = c.id
ORDER BY COALESCE(NULLIF(trim(c.course_name), ''), NULLIF(trim(c.club_name), ''), c.id::text);
