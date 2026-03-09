-- =====================================================
-- COURSES + COURSE DOMAIN DISCOVERY
-- For club-domain discovery crawler (UK golf courses)
-- =====================================================
--
-- Prerequisites: courses table must exist with id, name, area
-- If you have courses elsewhere, ensure this migration runs after
-- your courses table is created. Otherwise create courses first.
-- =====================================================

-- Create courses table if it doesn't exist (minimal schema for discovery)
CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add area column if courses exists but lacks it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'area'
  ) THEN
    ALTER TABLE public.courses ADD COLUMN area text;
  END IF;
END $$;

-- =====================================================
-- course_domains: candidate domains per course
-- =====================================================
CREATE TABLE IF NOT EXISTS public.course_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  domain text NOT NULL,
  homepage_url text,
  confidence numeric,
  source text,
  status text DEFAULT 'candidate',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(course_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_course_domains_course_id ON public.course_domains(course_id);
CREATE INDEX IF NOT EXISTS idx_course_domains_status ON public.course_domains(status);
CREATE INDEX IF NOT EXISTS idx_course_domains_confidence ON public.course_domains(confidence DESC);

-- =====================================================
-- course_domain_reviews: human approval decisions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.course_domain_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  chosen_domain text,
  chosen_url text,
  decision text,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_domain_reviews_course_id ON public.course_domain_reviews(course_id);

-- RLS: allow service role / anon for scripts (scripts use service key)
-- For app access, add policies as needed
ALTER TABLE public.course_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_domain_reviews ENABLE ROW LEVEL SECURITY;

-- Allow all for now (scripts use service key; app can restrict later)
DROP POLICY IF EXISTS course_domains_select_all ON public.course_domains;
CREATE POLICY course_domains_select_all ON public.course_domains FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS course_domains_insert_all ON public.course_domains;
CREATE POLICY course_domains_insert_all ON public.course_domains FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS course_domains_update_all ON public.course_domains;
CREATE POLICY course_domains_update_all ON public.course_domains FOR UPDATE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS course_domain_reviews_select_all ON public.course_domain_reviews;
CREATE POLICY course_domain_reviews_select_all ON public.course_domain_reviews FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS course_domain_reviews_insert_all ON public.course_domain_reviews;
CREATE POLICY course_domain_reviews_insert_all ON public.course_domain_reviews FOR INSERT TO anon, authenticated WITH CHECK (true);
