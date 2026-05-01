-- Free Play default search: only courses with a strict scorecard-ready active tee
-- (ratings + holes 1–18 par + SI 1–18 unique) and exclude duplicate display-name groups.
-- RPC returns JSON for a single round-trip: courses + broad vs ready name-match counts.

CREATE OR REPLACE FUNCTION public.free_play_search_scorecard_ready_courses(p_query text, p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $func$
WITH
lim AS (SELECT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)::integer AS n),
needle AS (SELECT NULLIF(trim(p_query), '') AS t),
has_needle AS (SELECT t FROM needle WHERE length(t) >= 2),
display_nk AS (
  SELECT c.id,
    lower(
      regexp_replace(
        trim(
          CASE
            WHEN nullif(trim(c.course_name), '') IS NOT NULL THEN trim(c.course_name)
            WHEN nullif(trim(c.club_name), '') IS NOT NULL THEN trim(c.club_name)
            ELSE '(no name)'
          END
        ),
        E'\\s+',
        ' ',
        'g'
      )
    ) AS nk
  FROM public.courses c
),
non_dup AS (
  SELECT d.id
  FROM display_nk d
  WHERE NOT EXISTS (SELECT 1 FROM display_nk d2 WHERE d2.nk = d.nk AND d2.id <> d.id)
),
active_rated_tees AS (
  SELECT ct.id AS tee_id, ct.course_id
  FROM public.course_tees ct
  WHERE ct.is_active IS DISTINCT FROM false
    AND ct.course_rating IS NOT NULL AND ct.course_rating::numeric > 0
    AND ct.slope_rating IS NOT NULL AND ct.slope_rating::numeric > 0
    AND ct.par_total IS NOT NULL AND ct.par_total::numeric > 0
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
  INNER JOIN active_rated_tees art ON art.tee_id = h.tee_id
  GROUP BY h.tee_id
),
strict_course AS (
  SELECT DISTINCT art.course_id
  FROM active_rated_tees art
  INNER JOIN hole_stats hs ON hs.tee_id = art.tee_id
  WHERE hs.rows_1_18 = 18
    AND hs.distinct_hole_nums = 18
    AND hs.holes_par_ok = 18
    AND hs.holes_si_in_range_int = 18
    AND hs.distinct_si_in_range = 18
),
broad AS (
  SELECT c.id
  FROM public.courses c
  CROSS JOIN has_needle hn
  WHERE strpos(lower(coalesce(c.course_name, '')), lower(hn.t)) > 0
     OR strpos(lower(coalesce(c.club_name, '')), lower(hn.t)) > 0
),
ready_named AS (
  SELECT c.*
  FROM public.courses c
  CROSS JOIN has_needle hn
  INNER JOIN strict_course sc ON sc.course_id = c.id
  INNER JOIN non_dup nd ON nd.id = c.id
  WHERE strpos(lower(coalesce(c.course_name, '')), lower(hn.t)) > 0
     OR strpos(lower(coalesce(c.club_name, '')), lower(hn.t)) > 0
),
limited AS (
  SELECT rn.*
  FROM ready_named rn
  ORDER BY rn.course_name NULLS LAST
  LIMIT (SELECT lim.n FROM lim)
),
broad_count AS (SELECT count(*)::bigint AS n FROM broad),
ready_count AS (SELECT count(*)::bigint AS n FROM ready_named),
agg AS (
  SELECT
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(limrow.*) ORDER BY limrow.course_name NULLS LAST) FROM limited limrow),
      '[]'::jsonb
    ) AS courses,
    COALESCE((SELECT n FROM broad_count), 0::bigint) AS broad_name_match_count,
    COALESCE((SELECT n FROM ready_count), 0::bigint) AS scorecard_ready_name_match_count
)
SELECT jsonb_build_object(
  'courses', agg.courses,
  'broad_name_match_count', agg.broad_name_match_count,
  'scorecard_ready_name_match_count', agg.scorecard_ready_name_match_count
)
FROM agg;
$func$;

COMMENT ON FUNCTION public.free_play_search_scorecard_ready_courses(text, integer) IS
  'Free Play course search: name substring match on courses with strict same-tee scorecard data; excludes duplicate display-name keys.';

GRANT EXECUTE ON FUNCTION public.free_play_search_scorecard_ready_courses(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.free_play_search_scorecard_ready_courses(text, integer) TO authenticated;
