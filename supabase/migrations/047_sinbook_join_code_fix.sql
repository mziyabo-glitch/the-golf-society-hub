-- 047_sinbook_join_code_fix.sql
-- Re-deploy sinbook join_code column + backfill for production.
-- Idempotent: safe to run even if 024 was partially applied.

-- 1. Add column (no-op if exists)
ALTER TABLE public.sinbooks
  ADD COLUMN IF NOT EXISTS join_code text;

-- 2. Unique index (no-op if exists)
CREATE UNIQUE INDEX IF NOT EXISTS sinbooks_join_code_key
  ON public.sinbooks (join_code) WHERE join_code IS NOT NULL;

-- 3. Code generator function
CREATE OR REPLACE FUNCTION public.generate_sinbook_join_code()
RETURNS text LANGUAGE plpgsql AS $gen$
DECLARE
  chars  text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END
$gen$;

-- 4. Trigger: auto-assign join_code on INSERT
CREATE OR REPLACE FUNCTION public.set_sinbook_join_code()
RETURNS trigger LANGUAGE plpgsql AS $trg$
DECLARE
  new_code text;
  attempts int := 0;
BEGIN
  IF NEW.join_code IS NOT NULL AND NEW.join_code <> '' THEN
    RETURN NEW;
  END IF;
  LOOP
    new_code := public.generate_sinbook_join_code();
    IF NOT EXISTS (SELECT 1 FROM public.sinbooks WHERE join_code = new_code) THEN
      NEW.join_code := new_code;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique sinbook join code after 20 attempts';
    END IF;
  END LOOP;
END
$trg$;

DROP TRIGGER IF EXISTS trg_sinbook_join_code ON public.sinbooks;
CREATE TRIGGER trg_sinbook_join_code
  BEFORE INSERT ON public.sinbooks
  FOR EACH ROW EXECUTE FUNCTION public.set_sinbook_join_code();

-- 5. Backfill all existing rows missing a join_code
DO $bf$
DECLARE
  r    record;
  code text;
  ok   boolean;
BEGIN
  FOR r IN SELECT id FROM public.sinbooks WHERE join_code IS NULL OR join_code = '' LOOP
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
END
$bf$;

-- 6. Lookup RPC (join-by-code flow)
CREATE OR REPLACE FUNCTION public.lookup_sinbook_by_join_code(_code text)
RETURNS TABLE(id uuid, title text, stake text, created_by uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $lkp$
  SELECT s.id, s.title, s.stake, s.created_by
  FROM public.sinbooks s
  WHERE s.join_code = upper(trim(_code))
  LIMIT 1
$lkp$;

GRANT EXECUTE ON FUNCTION public.lookup_sinbook_by_join_code(text) TO authenticated;

-- 7. Fast lookup index
CREATE INDEX IF NOT EXISTS idx_sinbooks_join_code ON public.sinbooks(join_code);

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
