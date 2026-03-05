-- 043_admin_list_societies.sql
-- Platform admin RPC: search/list all societies with key metadata.

DROP FUNCTION IF EXISTS public.admin_list_societies(text);

CREATE FUNCTION public.admin_list_societies(
  p_search text DEFAULT ''
)
RETURNS TABLE (
  id            uuid,
  name          text,
  country       text,
  join_code     text,
  member_count  bigint,
  captain_name  text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $als$
DECLARE
  v_term text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  v_term := '%' || lower(trim(coalesce(p_search, ''))) || '%';

  RETURN QUERY
  SELECT
    s.id,
    s.name::text,
    s.country::text,
    s.join_code::text,
    (SELECT count(*) FROM public.members m WHERE m.society_id = s.id)  AS member_count,
    (SELECT m.name FROM public.members m
      WHERE m.society_id = s.id AND upper(m.role) = 'CAPTAIN'
      LIMIT 1
    )::text AS captain_name
  FROM public.societies s
  WHERE v_term = '%%'
     OR lower(s.name) LIKE v_term
     OR lower(coalesce(s.join_code,'')) LIKE v_term
  ORDER BY s.name
  LIMIT 50;
END
$als$;

GRANT EXECUTE ON FUNCTION public.admin_list_societies(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
