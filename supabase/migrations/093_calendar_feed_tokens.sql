-- Opaque calendar subscription tokens: maps secret URL segment → user + society + member.
-- Feed is served by Vercel /api/calendar/[token].ics using service role (bypasses RLS).

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  society_id uuid NOT NULL REFERENCES public.societies (id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_feed_tokens_user_society_uq UNIQUE (user_id, society_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_feed_tokens_token ON public.calendar_feed_tokens (token);

DROP TRIGGER IF EXISTS trg_calendar_feed_tokens_updated ON public.calendar_feed_tokens;
CREATE TRIGGER trg_calendar_feed_tokens_updated
  BEFORE UPDATE ON public.calendar_feed_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_feed_tokens_select_own ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_select_own
  ON public.calendar_feed_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS calendar_feed_tokens_insert_own ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_insert_own
  ON public.calendar_feed_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.members m
      WHERE m.id = member_id
        AND m.user_id = auth.uid()
        AND m.society_id = society_id
    )
  );

DROP POLICY IF EXISTS calendar_feed_tokens_delete_own ON public.calendar_feed_tokens;
CREATE POLICY calendar_feed_tokens_delete_own
  ON public.calendar_feed_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create or return existing token for the active member in this society.
CREATE OR REPLACE FUNCTION public.ensure_calendar_feed_token(p_society_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
  v_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT m.id
  INTO v_member_id
  FROM public.members m
  WHERE m.user_id = auth.uid()
    AND m.society_id = p_society_id
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not a member of this society';
  END IF;

  SELECT cft.token
  INTO v_token
  FROM public.calendar_feed_tokens cft
  WHERE cft.user_id = auth.uid()
    AND cft.society_id = p_society_id;

  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  v_token := replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.calendar_feed_tokens (token, user_id, society_id, member_id)
  VALUES (v_token, auth.uid(), p_society_id, v_member_id);

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_calendar_feed_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_calendar_feed_token(uuid) TO authenticated;

COMMENT ON TABLE public.calendar_feed_tokens IS 'Secret per-user-per-society token for iCal subscription URL; readable by service role on Vercel only.';
