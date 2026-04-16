-- Home / join flow: members in event-linked societies must be able to read prize pool
-- rows (and rules) to opt in. Previously SELECT was manager-only, so listEventPrizePools
-- returned zero rows for normal members ("No prize pool competitions…").
--
-- Confirmed entrant counts for Home still need a definer RPC: RLS on entries only
-- exposes other entrants' rows to Pot Master / ManCo, not to every member.

-- ---------------------------------------------------------------------------
-- event_prize_pools: read for linked-society members (join flow + Home list)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS event_prize_pools_select ON public.event_prize_pools;

CREATE POLICY event_prize_pools_select
  ON public.event_prize_pools FOR SELECT TO authenticated
  USING (
    public.user_can_manage_event_prize_pools(event_id)
    OR public.user_member_of_event_linked_society(event_id)
  );

-- ---------------------------------------------------------------------------
-- event_prize_pool_rules: same visibility as pools (payout % display on Home)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS event_prize_pool_rules_select ON public.event_prize_pool_rules;

CREATE POLICY event_prize_pool_rules_select
  ON public.event_prize_pool_rules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND (
          public.user_can_manage_event_prize_pools(p.event_id)
          OR public.user_member_of_event_linked_society(p.event_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- event_prize_pool_results: members may read their own payout row (Home result)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS event_prize_pool_results_select ON public.event_prize_pool_results;

CREATE POLICY event_prize_pool_results_select
  ON public.event_prize_pool_results FOR SELECT TO authenticated
  USING (
    public.user_can_manage_event_prize_pools(event_id)
    OR EXISTS (
      SELECT 1 FROM public.members m
      WHERE m.id = event_prize_pool_results.member_id
        AND m.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Confirmed entrant count for Home (all confirmed rows; caller must be in scope)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.count_confirmed_prize_pool_entrants(p_pool_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_event_id uuid;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT event_id INTO v_event_id FROM public.event_prize_pools WHERE id = p_pool_id;
  IF v_event_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT (
    public.user_member_of_event_linked_society(v_event_id)
    OR public.user_can_manage_event_prize_pools(v_event_id)
  ) THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer
  INTO v_count
  FROM public.event_prize_pool_entries e
  WHERE e.pool_id = p_pool_id
    AND e.confirmed_by_pot_master = true;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_confirmed_prize_pool_entrants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_confirmed_prize_pool_entrants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_confirmed_prize_pool_entrants(uuid) TO service_role;

COMMENT ON FUNCTION public.count_confirmed_prize_pool_entrants(uuid) IS
  'Pot Master–confirmed entrant count for a pool; callable by linked-society members for Home display.';

NOTIFY pgrst, 'reload schema';
