-- 142: UK Golf API staging tables for review-before-promotion workflow.
-- Dry-run/inspect tooling may write here when UK_GOLF_API_ALLOW_STAGING_WRITES=true.
-- No production course tables are modified by this schema.

CREATE TABLE IF NOT EXISTS public.uk_golf_api_course_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_course_id text NOT NULL,
  provider_club_id text NULL,
  query text NULL,
  matched_club_name text NULL,
  matched_course_name text NULL,
  validation_status text NOT NULL DEFAULT 'unverified',
  verified_for_play boolean NOT NULL DEFAULT false,
  raw_json_checksum text NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending',
  review_notes text NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_golf_api_course_candidates_validation_status_chk
    CHECK (validation_status IN ('verified_candidate', 'partial', 'unverified')),
  CONSTRAINT uk_golf_api_course_candidates_review_status_chk
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT uk_golf_api_course_candidates_unique_provider_course
    UNIQUE (provider_course_id)
);

CREATE TABLE IF NOT EXISTS public.uk_golf_api_tee_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_candidate_id uuid NOT NULL REFERENCES public.uk_golf_api_course_candidates(id) ON DELETE CASCADE,
  tee_set text NULL,
  tee_colour text NULL,
  tee_gender text NULL,
  course_rating numeric NULL,
  slope_rating numeric NULL,
  par_total integer NULL,
  total_yardage integer NULL,
  validation_status text NOT NULL DEFAULT 'unverified',
  verified_for_play boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending',
  review_notes text NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_golf_api_tee_candidates_validation_status_chk
    CHECK (validation_status IN ('verified_candidate', 'partial', 'unverified')),
  CONSTRAINT uk_golf_api_tee_candidates_review_status_chk
    CHECK (review_status IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.uk_golf_api_hole_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_candidate_id uuid NOT NULL REFERENCES public.uk_golf_api_tee_candidates(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  par integer NULL,
  yardage integer NULL,
  stroke_index integer NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_golf_api_hole_candidates_hole_number_chk CHECK (hole_number >= 1 AND hole_number <= 36),
  CONSTRAINT uk_golf_api_hole_candidates_unique_tee_hole UNIQUE (tee_candidate_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_course_candidates_review_status
  ON public.uk_golf_api_course_candidates(review_status);

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_tee_candidates_course_candidate
  ON public.uk_golf_api_tee_candidates(course_candidate_id);

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_hole_candidates_tee_candidate
  ON public.uk_golf_api_hole_candidates(tee_candidate_id);
-- 142: UK Golf API staging tables for review-before-promotion workflow.
-- Dry-run/inspect tooling may write here when UK_GOLF_API_ALLOW_STAGING_WRITES=true.
-- No production course tables are modified by this schema.

CREATE TABLE IF NOT EXISTS public.uk_golf_api_course_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_course_id text NOT NULL,
  provider_club_id text NULL,
  query text NULL,
  matched_club_name text NULL,
  matched_course_name text NULL,
  validation_status text NOT NULL DEFAULT 'unverified',
  verified_for_play boolean NOT NULL DEFAULT false,
  raw_json_checksum text NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending',
  review_notes text NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_golf_api_course_candidates_validation_status_chk
    CHECK (validation_status IN ('verified_candidate', 'partial', 'unverified')),
  CONSTRAINT uk_golf_api_course_candidates_review_status_chk
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT uk_golf_api_course_candidates_unique_provider_course
    UNIQUE (provider_course_id)
);

CREATE TABLE IF NOT EXISTS public.uk_golf_api_tee_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_candidate_id uuid NOT NULL REFERENCES public.uk_golf_api_course_candidates(id) ON DELETE CASCADE,
  tee_set text NULL,
  tee_colour text NULL,
  tee_gender text NULL,
  course_rating numeric NULL,
  slope_rating numeric NULL,
  par_total integer NULL,
  total_yardage integer NULL,
  validation_status text NOT NULL DEFAULT 'unverified',
  verified_for_play boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now(),
  review_status text NOT NULL DEFAULT 'pending',
  review_notes text NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_golf_api_tee_candidates_validation_status_chk
    CHECK (validation_status IN ('verified_candidate', 'partial', 'unverified')),
  CONSTRAINT uk_golf_api_tee_candidates_review_status_chk
    CHECK (review_status IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE IF NOT EXISTS public.uk_golf_api_hole_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_candidate_id uuid NOT NULL REFERENCES public.uk_golf_api_tee_candidates(id) ON DELETE CASCADE,
  hole_number integer NOT NULL,
  par integer NULL,
  yardage integer NULL,
  stroke_index integer NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uk_golf_api_hole_candidates_hole_number_chk CHECK (hole_number >= 1 AND hole_number <= 36),
  CONSTRAINT uk_golf_api_hole_candidates_unique_tee_hole UNIQUE (tee_candidate_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_course_candidates_review_status
  ON public.uk_golf_api_course_candidates(review_status);

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_tee_candidates_course_candidate
  ON public.uk_golf_api_tee_candidates(course_candidate_id);

CREATE INDEX IF NOT EXISTS idx_uk_golf_api_hole_candidates_tee_candidate
  ON public.uk_golf_api_hole_candidates(tee_candidate_id);

