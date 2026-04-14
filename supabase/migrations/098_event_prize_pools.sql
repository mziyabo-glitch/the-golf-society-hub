-- Event Prize Pools: configuration and payout results for post-event prize allocation.
-- RLS: event managers (captain/secretary/treasurer/handicapper) on host or participating societies.

-- ---------------------------------------------------------------------------
-- Helpers-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.event_prize_pool_linked_society_ids(p_event_id uuid)
RETURNS TABLE (society_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT e.society_id FROM public.events e WHERE e.id = p_event_id
  UNION
  SELECT es.society_id FROM public.event_societies es WHERE es.event_id = p_event_id;
$$;

REVOKE ALL ON FUNCTION public.event_prize_pool_linked_society_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.event_prize_pool_linked_society_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.event_prize_pool_linked_society_ids(uuid) TO service_role;

COMMENT ON FUNCTION public.event_prize_pool_linked_society_ids(uuid) IS
  'Host society_id plus event_societies participants for an event (joint-safe).';

CREATE OR REPLACE FUNCTION public.user_can_manage_event_prize_pools(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_prize_pool_linked_society_ids(p_event_id) ls
    JOIN public.members m ON m.society_id = ls.society_id WHERE m.user_id = auth.uid()
      AND public.has_role_in_society(
        m.society_id,
        ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
      )
  );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_event_prize_pools(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_event_prize_pools(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_event_prize_pools(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- event_divisions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  min_handicap numeric(4,1),
  max_handicap numeric(4,1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_divisions_event_id ON public.event_divisions (event_id);

ALTER TABLE public.event_divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_divisions_select ON public.event_divisions;
DROP POLICY IF EXISTS event_divisions_insert ON public.event_divisions;
DROP POLICY IF EXISTS event_divisions_update ON public.event_divisions;
DROP POLICY IF EXISTS event_divisions_delete ON public.event_divisions;

CREATE POLICY event_divisions_select
  ON public.event_divisions FOR SELECT TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_divisions_insert
  ON public.event_divisions FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_divisions_update
  ON public.event_divisions FOR UPDATE TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id))
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_divisions_delete
  ON public.event_divisions FOR DELETE TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id));

-- ---------------------------------------------------------------------------
-- event_prize_pools
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_prize_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  host_society_id uuid REFERENCES public.societies(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  total_amount_pence integer NOT NULL CHECK (total_amount_pence >= 0),
  payout_mode text NOT NULL CHECK (payout_mode IN ('overall', 'division')),
  division_source text NOT NULL DEFAULT 'none' CHECK (division_source IN ('none', 'event')),
  places_paid integer NOT NULL CHECK (places_paid >= 1 AND places_paid <= 10),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'calculated', 'finalised')),
  include_guests boolean NOT NULL DEFAULT false,
  require_paid boolean NOT NULL DEFAULT true,
  require_confirmed boolean NOT NULL DEFAULT true,
  notes text,
  last_calculated_at timestamptz,
  finalised_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_prize_pools_event_id ON public.event_prize_pools (event_id);
CREATE INDEX IF NOT EXISTS idx_event_prize_pools_host_society_id ON public.event_prize_pools (host_society_id);
CREATE INDEX IF NOT EXISTS idx_event_prize_pools_status ON public.event_prize_pools (status);

DROP TRIGGER IF EXISTS trg_event_prize_pools_updated ON public.event_prize_pools;
CREATE TRIGGER trg_event_prize_pools_updated
  BEFORE UPDATE ON public.event_prize_pools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.event_prize_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_prize_pools_select ON public.event_prize_pools;
DROP POLICY IF EXISTS event_prize_pools_insert ON public.event_prize_pools;
DROP POLICY IF EXISTS event_prize_pools_update ON public.event_prize_pools;
DROP POLICY IF EXISTS event_prize_pools_delete ON public.event_prize_pools;

CREATE POLICY event_prize_pools_select
  ON public.event_prize_pools FOR SELECT TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pools_insert
  ON public.event_prize_pools FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pools_update
  ON public.event_prize_pools FOR UPDATE TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id))
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pools_delete
  ON public.event_prize_pools FOR DELETE TO authenticated
  USING (
    public.user_can_manage_event_prize_pools(event_id)
    AND status <> 'finalised'
  );

CREATE OR REPLACE FUNCTION public.event_prize_pools_block_finalised_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'finalised' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.total_amount_pence IS DISTINCT FROM OLD.total_amount_pence
      OR NEW.payout_mode IS DISTINCT FROM OLD.payout_mode
      OR NEW.division_source IS DISTINCT FROM OLD.division_source
      OR NEW.places_paid IS DISTINCT FROM OLD.places_paid
      OR NEW.include_guests IS DISTINCT FROM OLD.include_guests
      OR NEW.require_paid IS DISTINCT FROM OLD.require_paid
      OR NEW.require_confirmed IS DISTINCT FROM OLD.require_confirmed
      OR NEW.notes IS DISTINCT FROM OLD.notes
    THEN
      RAISE EXCEPTION 'Finalised pools can no longer be edited.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_prize_pools_block_finalised ON public.event_prize_pools;
CREATE TRIGGER trg_event_prize_pools_block_finalised
  BEFORE UPDATE ON public.event_prize_pools
  FOR EACH ROW EXECUTE FUNCTION public.event_prize_pools_block_finalised_mutation();

-- ---------------------------------------------------------------------------
-- event_prize_pool_rules
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_prize_pool_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.event_prize_pools(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1 AND position <= 10),
  percentage_basis_points integer NOT NULL CHECK (percentage_basis_points >= 0 AND percentage_basis_points <= 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_prize_pool_rules_pool_position_uq UNIQUE (pool_id, position)
);

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_rules_pool_id ON public.event_prize_pool_rules (pool_id);

ALTER TABLE public.event_prize_pool_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_prize_pool_rules_select ON public.event_prize_pool_rules;
DROP POLICY IF EXISTS event_prize_pool_rules_insert ON public.event_prize_pool_rules;
DROP POLICY IF EXISTS event_prize_pool_rules_update ON public.event_prize_pool_rules;
DROP POLICY IF EXISTS event_prize_pool_rules_delete ON public.event_prize_pool_rules;

CREATE POLICY event_prize_pool_rules_select
  ON public.event_prize_pool_rules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND public.user_can_manage_event_prize_pools(p.event_id)
    )
  );

CREATE POLICY event_prize_pool_rules_insert
  ON public.event_prize_pool_rules FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND public.user_can_manage_event_prize_pools(p.event_id)
        AND p.status <> 'finalised'
    )
  );

CREATE POLICY event_prize_pool_rules_update
  ON public.event_prize_pool_rules FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND public.user_can_manage_event_prize_pools(p.event_id)
        AND p.status <> 'finalised'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND public.user_can_manage_event_prize_pools(p.event_id)
        AND p.status <> 'finalised'
    )
  );

CREATE POLICY event_prize_pool_rules_delete
  ON public.event_prize_pool_rules FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id
        AND public.user_can_manage_event_prize_pools(p.event_id)
        AND p.status <> 'finalised'
    )
  );

-- ---------------------------------------------------------------------------
-- event_prize_pool_results
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.event_prize_pool_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.event_prize_pools(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  event_registration_id uuid REFERENCES public.event_registrations(id) ON DELETE SET NULL,
  division_name text,
  finishing_position integer NOT NULL,
  tie_size integer NOT NULL DEFAULT 1,
  payout_amount_pence integer NOT NULL CHECK (payout_amount_pence >= 0),
  calculation_note text,
  score_display text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_prize_pool_results_member_finish_uq
  ON public.event_prize_pool_results (pool_id, member_id, COALESCE(division_name, ''), finishing_position)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_prize_pool_results_pool_id ON public.event_prize_pool_results (pool_id);
CREATE INDEX IF NOT EXISTS idx_event_prize_pool_results_event_id ON public.event_prize_pool_results (event_id);
CREATE INDEX IF NOT EXISTS idx_event_prize_pool_results_member_id ON public.event_prize_pool_results (member_id);

ALTER TABLE public.event_prize_pool_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_prize_pool_results_select ON public.event_prize_pool_results;
DROP POLICY IF EXISTS event_prize_pool_results_insert ON public.event_prize_pool_results;
DROP POLICY IF EXISTS event_prize_pool_results_update ON public.event_prize_pool_results;
DROP POLICY IF EXISTS event_prize_pool_results_delete ON public.event_prize_pool_results;

CREATE POLICY event_prize_pool_results_select
  ON public.event_prize_pool_results FOR SELECT TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pool_results_insert
  ON public.event_prize_pool_results FOR INSERT TO authenticated
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pool_results_update
  ON public.event_prize_pool_results FOR UPDATE TO authenticated
  USING (public.user_can_manage_event_prize_pools(event_id))
  WITH CHECK (public.user_can_manage_event_prize_pools(event_id));

CREATE POLICY event_prize_pool_results_delete
  ON public.event_prize_pool_results FOR DELETE TO authenticated
  USING (
    public.user_can_manage_event_prize_pools(event_id)
    AND EXISTS (
      SELECT 1 FROM public.event_prize_pools p
      WHERE p.id = pool_id AND p.status <> 'finalised'
    )
  );

NOTIFY pgrst, 'reload schema';
