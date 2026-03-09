-- =====================================================
-- MIGRATION 047: Ensure Sinbook Join Code RPC
-- =====================================================
-- RPC to generate and assign a join_code if the sinbook
-- has none (e.g. legacy rows or migration gap).
-- Only participants can call; returns the 6-char code.
-- =====================================================

CREATE OR REPLACE FUNCTION public.ensure_sinbook_join_code(p_sinbook_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_code text;
  new_code text;
  attempts int := 0;
BEGIN
  -- Must be a participant
  IF NOT public.is_sinbook_participant(p_sinbook_id) AND
     NOT EXISTS (SELECT 1 FROM public.sinbooks WHERE id = p_sinbook_id AND created_by = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to access this rivalry';
  END IF;

  SELECT join_code INTO cur_code FROM public.sinbooks WHERE id = p_sinbook_id;
  IF cur_code IS NOT NULL AND cur_code <> '' THEN
    RETURN cur_code;
  END IF;

  -- Generate and assign
  LOOP
    new_code := public.generate_sinbook_join_code();
    IF NOT EXISTS (SELECT 1 FROM public.sinbooks WHERE join_code = new_code) THEN
      UPDATE public.sinbooks SET join_code = new_code, updated_at = now() WHERE id = p_sinbook_id;
      RETURN new_code;
    END IF;
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not generate unique join code after 20 attempts';
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_sinbook_join_code(uuid) TO authenticated;
