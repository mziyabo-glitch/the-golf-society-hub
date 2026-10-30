-- 095_sync_my_membership_names_from_profile.sql
-- Keep denormalized members.name aligned with profiles.full_name for the signed-in user.

DROP FUNCTION IF EXISTS public.sync_my_membership_names_from_profile();

CREATE OR REPLACE FUNCTION public.sync_my_membership_names_from_profile()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_full_name text;
  v_rows integer := 0;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated. Please sign in first.';
  END IF;

  SELECT NULLIF(TRIM(p.full_name), '')
    INTO v_full_name
  FROM public.profiles p
  WHERE p.id = v_uid;

  -- Nothing to sync when profile name is blank/missing.
  IF v_full_name IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.members m
     SET name = v_full_name
   WHERE m.user_id = v_uid
     AND COALESCE(TRIM(m.name), '') IS DISTINCT FROM v_full_name;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_my_membership_names_from_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_my_membership_names_from_profile() TO authenticated;

COMMENT ON FUNCTION public.sync_my_membership_names_from_profile() IS
  'Sync the signed-in user profile full_name to all linked members.name rows by user_id.';

NOTIFY pgrst, 'reload schema';
