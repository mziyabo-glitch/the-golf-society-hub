-- Batch load identity hints for sinbook participants (profiles + auth metadata).
-- SECURITY DEFINER: callers cannot SELECT other users' profiles directly under RLS.
-- Access: viewer must be pending/accepted participant on that sinbook, or sinbook creator.

DROP FUNCTION IF EXISTS public.get_sinbook_participant_display_context_batch(uuid[]);

CREATE OR REPLACE FUNCTION public.get_sinbook_participant_display_context_batch(p_sinbook_ids uuid[])
RETURNS TABLE (
  sinbook_id uuid,
  user_id uuid,
  participant_display_name text,
  profile_full_name text,
  profile_email text,
  auth_meta_full_name text,
  auth_meta_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT
    p.sinbook_id,
    p.user_id,
    p.display_name::text,
    pr.full_name::text,
    pr.email::text,
    (u.raw_user_meta_data->>'full_name')::text,
    (u.raw_user_meta_data->>'name')::text
  FROM public.sinbook_participants p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE cardinality(p_sinbook_ids) > 0
    AND p.sinbook_id = ANY (p_sinbook_ids)
    AND (
      EXISTS (
        SELECT 1
        FROM public.sinbook_participants me
        WHERE me.sinbook_id = p.sinbook_id
          AND me.user_id = auth.uid()
          AND me.status IN ('pending', 'accepted')
      )
      OR EXISTS (
        SELECT 1
        FROM public.sinbooks s
        WHERE s.id = p.sinbook_id
          AND s.created_by = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_sinbook_participant_display_context_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sinbook_participant_display_context_batch(uuid[]) TO authenticated;
