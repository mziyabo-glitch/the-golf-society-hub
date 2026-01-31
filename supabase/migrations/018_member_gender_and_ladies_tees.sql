-- Migration: Add gender to members and Ladies' tee settings to events
-- This supports WHS calculations with different tees for Men and Women

-- Add gender column to members
-- 'M' = Male, 'F' = Female, NULL = not specified
ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS gender text CHECK (gender IS NULL OR gender IN ('M', 'F'));

-- Add Ladies' tee settings to events
-- Men's settings use existing columns: par, course_rating, slope_rating, tee_name
-- Ladies' settings use these new columns
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS ladies_tee_name text,
ADD COLUMN IF NOT EXISTS ladies_par integer CHECK (ladies_par IS NULL OR (ladies_par >= 54 AND ladies_par <= 80)),
ADD COLUMN IF NOT EXISTS ladies_course_rating numeric(4,1) CHECK (ladies_course_rating IS NULL OR (ladies_course_rating >= 50 AND ladies_course_rating <= 90)),
ADD COLUMN IF NOT EXISTS ladies_slope_rating integer CHECK (ladies_slope_rating IS NULL OR (ladies_slope_rating >= 55 AND ladies_slope_rating <= 155));

-- Add comment explaining the dual-tee system
COMMENT ON COLUMN public.members.gender IS 'Player gender for tee selection: M=Male, F=Female';
COMMENT ON COLUMN public.events.ladies_tee_name IS 'Name of Ladies tee (e.g., Red, Forward)';
COMMENT ON COLUMN public.events.ladies_par IS 'Par from Ladies tee';
COMMENT ON COLUMN public.events.ladies_course_rating IS 'Course Rating from Ladies tee';
COMMENT ON COLUMN public.events.ladies_slope_rating IS 'Slope Rating from Ladies tee';

-- Create index on gender for filtering
CREATE INDEX IF NOT EXISTS idx_members_gender ON public.members(gender) WHERE gender IS NOT NULL;
