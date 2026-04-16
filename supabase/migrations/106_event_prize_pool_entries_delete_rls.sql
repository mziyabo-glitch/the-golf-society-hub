-- Deleting a row from event_prize_pools CASCADE-deletes dependent rows in
-- event_prize_pool_entries. RLS still applies to those child DELETEs; the entries
-- table had no DELETE policy, so every pool delete failed with an FK/RLS failure.

DROP POLICY IF EXISTS event_prize_pool_entries_delete ON public.event_prize_pool_entries;

CREATE POLICY event_prize_pool_entries_delete
  ON public.event_prize_pool_entries FOR DELETE TO authenticated
  USING (
    public.user_can_manage_event_prize_pools(event_id)
    AND EXISTS (
      SELECT 1
      FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND p.status <> 'finalised'
    )
  );

COMMENT ON POLICY event_prize_pool_entries_delete ON public.event_prize_pool_entries IS
  'Lets prize pool managers delete entry rows when removing a non-finalised pool (FK ON DELETE CASCADE), aligned with event_prize_pool_results_delete.';

NOTIFY pgrst, 'reload schema';
