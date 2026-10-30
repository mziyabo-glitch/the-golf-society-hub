-- Trusted-field enforcement + staff review RPC body (gsh_review, course triggers).
-- Runs after 134: requires `public.course_data_submissions` (and related RPCs) from 134_course_trust_workflow.sql.
--
-- Idempotent: safe on fresh DBs that already picked up the merged 134 (CREATE OR REPLACE / DROP IF EXISTS).
-- Required on DBs that applied an older 134 before enforcement was merged into that file.

-- ---------------------------------------------------------------------------
-- 1) Allow validation_basis = 'gsh_review'
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_validation_basis_chk;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_validation_basis_chk
  CHECK (
    validation_basis IN (
      'official_only',
      'official_plus_secondary',
      'dual_secondary_match',
      'secondary_only',
      'gsh_review'
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Trigger: protect trusted columns on courses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.courses_protect_trusted_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
  gs_new text;
BEGIN
  jwt_role := nullif(btrim(coalesce(current_setting('request.jwt.claim.role', true), '')), '');

  IF jwt_role IS NULL OR jwt_role = '' OR jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    gs_new := lower(btrim(coalesce(NEW.golfer_data_status::text, 'unverified')));
    IF gs_new IN ('verified', 'partial', 'rejected') THEN
      RAISE EXCEPTION 'courses: only Golf Society Hub staff may set golfer_data_status to verified, partial, or rejected';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.golfer_data_status IS NOT DISTINCT FROM OLD.golfer_data_status
     AND NEW.validation_basis IS NOT DISTINCT FROM OLD.validation_basis
     AND NEW.data_confidence IS NOT DISTINCT FROM OLD.data_confidence THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'courses: only Golf Society Hub staff may change golfer_data_status, validation_basis, or data_confidence';
END;
$$;

DROP TRIGGER IF EXISTS courses_protect_trusted_columns_ins ON public.courses;
CREATE TRIGGER courses_protect_trusted_columns_ins
  BEFORE INSERT ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.courses_protect_trusted_columns();

DROP TRIGGER IF EXISTS courses_protect_trusted_columns_upd ON public.courses;
CREATE TRIGGER courses_protect_trusted_columns_upd
  BEFORE UPDATE ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.courses_protect_trusted_columns();

-- ---------------------------------------------------------------------------
-- 3) RPC: staff review (RETURNS course_data_submissions — table must exist)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_course_data_submission(
  p_submission_id uuid,
  p_decision text,
  p_review_notes text DEFAULT NULL,
  p_mark_course_status text DEFAULT NULL
)
RETURNS public.course_data_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.course_data_submissions%ROWTYPE;
  cid uuid;
  st text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'review_course_data_submission: platform admin only';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'review_course_data_submission: invalid decision';
  END IF;

  SELECT * INTO s FROM public.course_data_submissions WHERE id = p_submission_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_course_data_submission: submission not found';
  END IF;

  UPDATE public.course_data_submissions
  SET
    status = p_decision,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_notes = NULLIF(btrim(p_review_notes), '')
  WHERE id = p_submission_id
  RETURNING * INTO s;

  IF p_decision = 'approved'
     AND p_mark_course_status IS NOT NULL
     AND btrim(p_mark_course_status) <> '' THEN
    st := lower(btrim(p_mark_course_status));
    IF st NOT IN ('verified', 'partial', 'unverified', 'rejected') THEN
      RAISE EXCEPTION 'review_course_data_submission: invalid mark_course_status';
    END IF;
    cid := s.course_id;
    UPDATE public.courses c
    SET
      golfer_data_status = st,
      validation_basis = 'gsh_review',
      data_confidence = CASE
        WHEN st = 'verified' THEN 'high'
        WHEN st = 'partial' THEN 'medium'
        ELSE coalesce(c.data_confidence, 'low'::text)
      END
    WHERE c.id = cid;
  END IF;

  RETURN s;
END;
$$;

REVOKE ALL ON FUNCTION public.review_course_data_submission(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_course_data_submission(uuid, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
