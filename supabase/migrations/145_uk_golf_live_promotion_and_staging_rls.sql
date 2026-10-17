-- UK Golf API: live promotion provenance + staging RLS (platform admin review only).
-- Service role bypasses RLS (dry-run staging writes + promote script).

-- ---------------------------------------------------------------------------
-- 1) Live tables: provider ids + import batch (rollback / audit)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS source_provider_course_id text NULL,
  ADD COLUMN IF NOT EXISTS source_import_batch_id uuid NULL;

ALTER TABLE public.course_tees
  ADD COLUMN IF NOT EXISTS source_provider_tee_set_id text NULL,
  ADD COLUMN IF NOT EXISTS source_import_batch_id uuid NULL;

ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS source_import_batch_id uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_uk_golf_provider_course
  ON public.courses (source_provider_course_id)
  WHERE source_type IS NOT DISTINCT FROM 'uk_golf_api'
    AND source_provider_course_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_tees_uk_golf_provider_tee
  ON public.course_tees (course_id, source_provider_tee_set_id)
  WHERE source_type IS NOT DISTINCT FROM 'uk_golf_api'
    AND source_provider_tee_set_id IS NOT NULL;

COMMENT ON COLUMN public.courses.source_provider_course_id IS 'External provider course id (e.g. UK Golf API UUID).';
COMMENT ON COLUMN public.courses.source_import_batch_id IS 'Last promotion batch that wrote this row (uk_golf_api promote script).';
COMMENT ON COLUMN public.course_tees.source_provider_tee_set_id IS 'External provider tee set id (e.g. UK Golf API).';
COMMENT ON COLUMN public.course_tees.source_import_batch_id IS 'Last promotion batch that wrote this row.';
COMMENT ON COLUMN public.course_holes.source_import_batch_id IS 'Last promotion batch that wrote this row.';

-- ---------------------------------------------------------------------------
-- 2) Staging RLS: platform admins only (authenticated)
-- ---------------------------------------------------------------------------
ALTER TABLE public.uk_golf_api_course_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uk_golf_api_tee_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uk_golf_api_hole_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uk_golf_api_course_candidates_select_admin ON public.uk_golf_api_course_candidates;
CREATE POLICY uk_golf_api_course_candidates_select_admin
  ON public.uk_golf_api_course_candidates
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS uk_golf_api_course_candidates_update_admin ON public.uk_golf_api_course_candidates;
CREATE POLICY uk_golf_api_course_candidates_update_admin
  ON public.uk_golf_api_course_candidates
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS uk_golf_api_tee_candidates_select_admin ON public.uk_golf_api_tee_candidates;
CREATE POLICY uk_golf_api_tee_candidates_select_admin
  ON public.uk_golf_api_tee_candidates
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS uk_golf_api_tee_candidates_update_admin ON public.uk_golf_api_tee_candidates;
CREATE POLICY uk_golf_api_tee_candidates_update_admin
  ON public.uk_golf_api_tee_candidates
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS uk_golf_api_hole_candidates_select_admin ON public.uk_golf_api_hole_candidates;
CREATE POLICY uk_golf_api_hole_candidates_select_admin
  ON public.uk_golf_api_hole_candidates
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Holes are not reviewed independently; no UPDATE policy for authenticated.

-- ---------------------------------------------------------------------------
-- 3) SECURITY DEFINER review RPCs (trusted reviewed_by / reviewed_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_uk_golf_api_course_candidate(
  p_course_candidate_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.uk_golf_api_course_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.uk_golf_api_course_candidates%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'review_uk_golf_api_course_candidate: platform admin only';
  END IF;

  IF p_review_status IS NULL OR p_review_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'review_uk_golf_api_course_candidate: invalid review_status';
  END IF;

  UPDATE public.uk_golf_api_course_candidates
  SET
    review_status = p_review_status,
    review_notes = NULLIF(btrim(p_review_notes), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_course_candidate_id
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_uk_golf_api_course_candidate: candidate not found';
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.review_uk_golf_api_course_candidate(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_uk_golf_api_course_candidate(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_uk_golf_api_tee_candidate(
  p_tee_candidate_id uuid,
  p_review_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.uk_golf_api_tee_candidates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.uk_golf_api_tee_candidates%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'review_uk_golf_api_tee_candidate: platform admin only';
  END IF;

  IF p_review_status IS NULL OR p_review_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'review_uk_golf_api_tee_candidate: invalid review_status';
  END IF;

  UPDATE public.uk_golf_api_tee_candidates
  SET
    review_status = p_review_status,
    review_notes = NULLIF(btrim(p_review_notes), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_tee_candidate_id
  RETURNING * INTO r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_uk_golf_api_tee_candidate: candidate not found';
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.review_uk_golf_api_tee_candidate(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_uk_golf_api_tee_candidate(uuid, text, text) TO authenticated;
