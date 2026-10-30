-- Free Play trust model: society-local approval vs global golfer_data_status (platform only).
-- Tables: course_society_approvals, course_data_submissions, course_data_submission_assets
-- RPCs: approve_course_for_society, submit_course_data_review, review_course_data_submission
--
-- DDL order: `review_course_data_submission` RETURNS public.course_data_submissions, so it is defined
-- only after `course_data_submissions` is created (sections 1–4), then trusted-column guards + RPC (5–6).
-- Migration 135 repeats that enforcement idempotently for databases that applied an older 134 without it.

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_society_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL,
  CONSTRAINT course_society_approvals_course_society_uniq UNIQUE (course_id, society_id)
);

CREATE INDEX IF NOT EXISTS idx_course_society_approvals_society_course
  ON public.course_society_approvals(society_id, course_id);

CREATE TABLE IF NOT EXISTS public.course_data_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  society_id uuid NULL REFERENCES public.societies(id) ON DELETE SET NULL,
  submission_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  notes text NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  CONSTRAINT course_data_submissions_type_chk
    CHECK (submission_type IN ('manual_entry', 'scorecard_photo', 'manual_plus_photo')),
  CONSTRAINT course_data_submissions_status_chk
    CHECK (status IN ('pending_review', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_course_data_submissions_course_status
  ON public.course_data_submissions(course_id, status);

CREATE INDEX IF NOT EXISTS idx_course_data_submissions_submitted_by
  ON public.course_data_submissions(submitted_by);

CREATE INDEX IF NOT EXISTS idx_course_data_submissions_society_id
  ON public.course_data_submissions(society_id);

CREATE TABLE IF NOT EXISTS public.course_data_submission_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.course_data_submissions(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  asset_type text NOT NULL,
  CONSTRAINT course_data_submission_assets_type_chk
    CHECK (asset_type IN ('scorecard_front', 'scorecard_back', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_course_data_submission_assets_submission
  ON public.course_data_submission_assets(submission_id);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_society_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_data_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_data_submission_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS course_society_approvals_select ON public.course_society_approvals;
CREATE POLICY course_society_approvals_select ON public.course_society_approvals
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.society_id = course_society_approvals.society_id
        AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS course_data_submissions_select ON public.course_data_submissions;
CREATE POLICY course_data_submissions_select ON public.course_data_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR course_data_submissions.submitted_by = auth.uid()
    OR (
      course_data_submissions.society_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.members m
        WHERE m.society_id = course_data_submissions.society_id
          AND m.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS course_data_submission_assets_select ON public.course_data_submission_assets;
CREATE POLICY course_data_submission_assets_select ON public.course_data_submission_assets
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.course_data_submissions s
      WHERE s.id = course_data_submission_assets.submission_id
        AND (
          s.submitted_by = auth.uid()
          OR (
            s.society_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.members m
              WHERE m.society_id = s.society_id AND m.user_id = auth.uid()
            )
          )
        )
    )
  );

-- Mutations are performed via SECURITY DEFINER RPCs only (no INSERT/UPDATE policies for authenticated).

-- ---------------------------------------------------------------------------
-- 3) RPC: society ManCo approves course for local society use
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_course_for_society(
  p_course_id uuid,
  p_society_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.course_society_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.course_society_approvals%ROWTYPE;
BEGIN
  IF NOT public.has_role_in_society(
    p_society_id,
    ARRAY['captain', 'secretary', 'treasurer', 'handicapper']::text[]
  ) THEN
    RAISE EXCEPTION 'approve_course_for_society: forbidden (requires Captain/Secretary/Treasurer/Handicapper)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id) THEN
    RAISE EXCEPTION 'approve_course_for_society: course not found';
  END IF;

  INSERT INTO public.course_society_approvals (course_id, society_id, approved_by, notes)
  VALUES (p_course_id, p_society_id, auth.uid(), p_notes)
  ON CONFLICT (course_id, society_id) DO UPDATE SET
    approved_by = EXCLUDED.approved_by,
    approved_at = now(),
    notes = COALESCE(EXCLUDED.notes, course_society_approvals.notes)
  RETURNING * INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_course_for_society(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_course_for_society(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) RPC: member submits course data for platform review
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_course_data_review(
  p_course_id uuid,
  p_society_id uuid,
  p_submission_type text,
  p_notes text,
  p_payload jsonb
)
RETURNS public.course_data_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.course_data_submissions%ROWTYPE;
BEGIN
  IF p_submission_type IS NULL
     OR p_submission_type NOT IN ('manual_entry', 'scorecard_photo', 'manual_plus_photo') THEN
    RAISE EXCEPTION 'submit_course_data_review: invalid submission_type';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id) THEN
    RAISE EXCEPTION 'submit_course_data_review: course not found';
  END IF;

  IF p_society_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.society_id = p_society_id AND m.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'submit_course_data_review: not a member of society';
    END IF;
  END IF;

  INSERT INTO public.course_data_submissions (
    course_id,
    submitted_by,
    society_id,
    submission_type,
    status,
    notes,
    payload
  ) VALUES (
    p_course_id,
    auth.uid(),
    p_society_id,
    p_submission_type,
    'pending_review',
    NULLIF(btrim(p_notes), ''),
    p_payload
  )
  RETURNING * INTO s;

  IF p_payload IS NOT NULL AND jsonb_typeof(p_payload -> 'assets') = 'array' THEN
    INSERT INTO public.course_data_submission_assets (submission_id, storage_path, asset_type)
    SELECT
      s.id,
      NULLIF(btrim(asset ->> 'storage_path'), ''),
      CASE
        WHEN lower(btrim(coalesce(asset ->> 'asset_type', ''))) IN ('scorecard_front', 'scorecard_back', 'other')
          THEN lower(btrim(asset ->> 'asset_type'))
        ELSE 'other'
      END
    FROM jsonb_array_elements(coalesce(p_payload -> 'assets', '[]'::jsonb)) AS t(asset)
    WHERE NULLIF(btrim(asset ->> 'storage_path'), '') IS NOT NULL;
  END IF;

  RETURN s;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_course_data_review(uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_course_data_review(uuid, uuid, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Trusted course columns: validation_basis value + DB guard (after trust tables exist)
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
-- 6) RPC: platform admin reviews submission (optional global course status; gsh_review basis)
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
