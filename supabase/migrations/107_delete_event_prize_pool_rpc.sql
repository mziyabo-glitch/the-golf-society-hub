-- Client DELETE on event_prize_pools can still fail or no-op when CASCADE touches
-- many child tables under RLS. Use a SECURITY DEFINER RPC (row_security off) so
-- one authorized DELETE removes the pool and FK-cascaded rows, same pattern as
-- delete_event_prize_pool_entry.

CREATE OR REPLACE FUNCTION public.delete_event_prize_pool(p_pool_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.event_id, p.status
  INTO v_event_id, v_status
  FROM public.event_prize_pools p
  WHERE p.id = p_pool_id;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Prize pool not found.';
  END IF;

  IF v_status = 'finalised' THEN
    RAISE EXCEPTION 'Finalised pools cannot be deleted.';
  END IF;

  IF NOT public.user_can_manage_event_prize_pools(v_event_id) THEN
    RAISE EXCEPTION 'Permission denied.';
  END IF;

  DELETE FROM public.event_prize_pools WHERE id = p_pool_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_event_prize_pool(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_event_prize_pool(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_event_prize_pool(uuid) TO service_role;

COMMENT ON FUNCTION public.delete_event_prize_pool(uuid) IS
  'Deletes a non-finalised prize pool and all ON DELETE CASCADE dependents; authorization matches event_prize_pools_delete.';

NOTIFY pgrst, 'reload schema';
