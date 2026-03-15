-- Make courses.lat and courses.lng nullable
-- Coordinates are useful but should not block course import when API omits them

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'lat'
  ) THEN
    ALTER TABLE public.courses ALTER COLUMN lat DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'lng'
  ) THEN
    ALTER TABLE public.courses ALTER COLUMN lng DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.courses.lat IS 'Latitude; nullable when API omits coordinates';
COMMENT ON COLUMN public.courses.lng IS 'Longitude; nullable when API omits coordinates';
