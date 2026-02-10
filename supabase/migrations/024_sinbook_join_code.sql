-- =====================================================
-- MIGRATION 024: Sinbook Join Codes
-- =====================================================
-- Adds a short, human-friendly join code to each sinbook
-- so rivals can join by typing a 6-character code instead
-- of sharing a full UUID link.
--
-- Format: 6 uppercase alphanumeric chars (no confusing 0/O, 1/I/L)
-- Generated automatically on insert via trigger.
-- =====================================================

-- 1) Add column
ALTER TABLE public.sinbooks
  ADD COLUMN IF NOT EXISTS join_code text UNIQUE;

-- 2) Function to generate a random 6-char code
CREATE OR REPLACE FUNCTION public.generate_sinbook_join_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 3) Trigger function: set join_code on insert if not provided
CREATE OR REPLACE FUNCTION public.set_sinbook_join_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  new_code text;
  attempts int := 0;
BEGIN
  IF NEW.join_code IS NOT NULL AND NEW.join_code <> '' THEN
    RETURN NEW;
  END IF;

  LOOP
    new_code := public.generate_sinbook_join_code();
    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM public.sinbooks WHERE join_code = new_code) THEN
      NEW.join_code := new_code;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique sinbook join code after 20 attempts';
    END IF;
  END LOOP;
END;
$$;

CREATE TRIGGER trg_sinbook_join_code
  BEFORE INSERT ON public.sinbooks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_sinbook_join_code();

-- 4) Backfill existing sinbooks that have no join_code
DO $$
DECLARE
  r record;
  code text;
  ok boolean;
BEGIN
  FOR r IN SELECT id FROM public.sinbooks WHERE join_code IS NULL LOOP
    ok := false;
    FOR i IN 1..20 LOOP
      code := public.generate_sinbook_join_code();
      IF NOT EXISTS (SELECT 1 FROM public.sinbooks WHERE join_code = code) THEN
        UPDATE public.sinbooks SET join_code = code WHERE id = r.id;
        ok := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT ok THEN
      RAISE WARNING 'Could not assign join code to sinbook %', r.id;
    END IF;
  END LOOP;
END;
$$;

-- 5) Index for fast lookup by join_code
CREATE INDEX IF NOT EXISTS idx_sinbooks_join_code ON public.sinbooks(join_code);

-- 6) RLS: allow anyone authenticated to look up a sinbook by join_code
--    (The existing sinbooks_select policy requires participation or ownership,
--     but we need unauthenticated-ish lookup for the join flow.)
--    We add a SECURITY DEFINER function that returns limited info.
CREATE OR REPLACE FUNCTION public.lookup_sinbook_by_join_code(_code text)
RETURNS TABLE(id uuid, title text, stake text, created_by uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT s.id, s.title, s.stake, s.created_by
  FROM public.sinbooks s
  WHERE s.join_code = upper(trim(_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_sinbook_by_join_code(text) TO authenticated;
