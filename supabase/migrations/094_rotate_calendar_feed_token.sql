-- Replace calendar feed secret for the current user + society (old URL 404s immediately).

CREATE OR REPLACE FUNCTION public.rotate_calendar_feed_token(p_society_id uuid)
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

  v_token := replace(replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');

  INSERT INTO public.calendar_feed_tokens (token, user_id, society_id, member_id)
  VALUES (v_token, auth.uid(), p_society_id, v_member_id)
  ON CONFLICT (user_id, society_id)
  DO UPDATE SET
    token = EXCLUDED.token,
    updated_at = now()
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_calendar_feed_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_calendar_feed_token(uuid) TO authenticated;
