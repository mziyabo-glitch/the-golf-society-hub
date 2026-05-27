-- Tee sheet draft CRUD: treasurer + joint participant ManCo; shared permission helper.

CREATE OR REPLACE FUNCTION public.can_manage_event_tee_sheet(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND (
        (
          e.society_id IN (SELECT public.my_society_ids())
          AND public.has_role_in_society(
            e.society_id,
            ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.event_societies es
          WHERE es.event_id = p_event_id
            AND es.society_id IN (SELECT public.my_society_ids())
            AND public.has_role_in_society(
              es.society_id,
              ARRAY['captain', 'secretary', 'treasurer', 'handicapper']
            )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_event_tee_sheet(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_event_tee_sheet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_event_tee_sheet(uuid) TO service_role;

COMMENT ON FUNCTION public.can_manage_event_tee_sheet(uuid) IS
  'Host or joint-participant ManCo (captain, secretary, treasurer, handicapper) may save tee sheet drafts.';

-- tee_groups / tee_group_players (standard events)
DROP POLICY IF EXISTS tee_groups_select ON public.tee_groups;
DROP POLICY IF EXISTS tee_groups_insert ON public.tee_groups;
DROP POLICY IF EXISTS tee_groups_update ON public.tee_groups;
DROP POLICY IF EXISTS tee_groups_delete ON public.tee_groups;

CREATE POLICY tee_groups_select ON public.tee_groups FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()))
    OR public.current_user_linked_to_event(event_id)
  );

CREATE POLICY tee_groups_insert ON public.tee_groups FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_event_tee_sheet(event_id));

CREATE POLICY tee_groups_update ON public.tee_groups FOR UPDATE TO authenticated
  USING (public.can_manage_event_tee_sheet(event_id));

CREATE POLICY tee_groups_delete ON public.tee_groups FOR DELETE TO authenticated
  USING (public.can_manage_event_tee_sheet(event_id));

DROP POLICY IF EXISTS tee_group_players_select ON public.tee_group_players;
DROP POLICY IF EXISTS tee_group_players_insert ON public.tee_group_players;
DROP POLICY IF EXISTS tee_group_players_update ON public.tee_group_players;
DROP POLICY IF EXISTS tee_group_players_delete ON public.tee_group_players;

CREATE POLICY tee_group_players_select ON public.tee_group_players FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.society_id IN (SELECT public.my_society_ids()))
    OR public.current_user_linked_to_event(event_id)
  );

CREATE POLICY tee_group_players_insert ON public.tee_group_players FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_event_tee_sheet(event_id));

CREATE POLICY tee_group_players_update ON public.tee_group_players FOR UPDATE TO authenticated
  USING (public.can_manage_event_tee_sheet(event_id));

CREATE POLICY tee_group_players_delete ON public.tee_group_players FOR DELETE TO authenticated
  USING (public.can_manage_event_tee_sheet(event_id));

-- clear_tee_sheet_for_event
CREATE OR REPLACE FUNCTION public.clear_tee_sheet_for_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_manage_event_tee_sheet(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied to clear tee sheet for this event';
  END IF;

  DELETE FROM public.tee_group_players WHERE event_id = p_event_id;
  DELETE FROM public.tee_groups WHERE event_id = p_event_id;
END;
$$;

-- joint tee sheet replace (permission only — body unchanged from 077)
CREATE OR REPLACE FUNCTION public.replace_joint_event_tee_sheet_entries(
  p_event_id uuid,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_elem jsonb;
  v_player_id uuid;
  v_group integer;
  v_pos integer;
  v_entry_id uuid;
  v_member_society uuid;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  IF NOT public.can_manage_event_tee_sheet(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied to replace joint event tee sheet entries for this event';
  END IF;

  DELETE FROM public.event_entries WHERE event_id = p_event_id;

  FOR rec IN
    SELECT elem FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS t(elem)
  LOOP
    v_elem := rec.elem;
    BEGIN
      v_player_id := NULLIF(trim(v_elem->>'player_id'), '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_player_id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_elem->>'pairing_group' IS NULL OR trim(v_elem->>'pairing_group') = '' THEN
      v_group := NULL;
    ELSE
      v_group := (v_elem->>'pairing_group')::integer;
    END IF;

    IF v_elem->>'pairing_position' IS NULL OR trim(v_elem->>'pairing_position') = '' THEN
      v_pos := NULL;
    ELSE
      v_pos := (v_elem->>'pairing_position')::integer;
    END IF;

    INSERT INTO public.event_entries (event_id, player_id, status, pairing_group, pairing_position)
    VALUES (p_event_id, v_player_id, 'confirmed', v_group, v_pos)
    RETURNING id INTO v_entry_id;

    SELECT society_id INTO v_member_society FROM public.members WHERE id = v_player_id;
    IF v_member_society IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = p_event_id AND es.society_id = v_member_society
    ) THEN
      INSERT INTO public.event_entry_society_eligibility (
        event_entry_id,
        society_id,
        is_eligible_for_society_results,
        is_eligible_for_society_oom
      )
      VALUES (v_entry_id, v_member_society, true, true)
      ON CONFLICT (event_entry_id, society_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- unpublish: treasurer on joint/host
CREATE OR REPLACE FUNCTION public.unpublish_tee_times(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  IF NOT public.can_manage_event_tee_sheet(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied to unpublish tee times for this event';
  END IF;

  UPDATE public.events
  SET tee_time_published_at = NULL
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;
END;
$$;

-- publish: require ManCo (was unrestricted SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.publish_tee_times(
  p_event_id   uuid,
  p_start_time text,
  p_interval   integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event_id is required';
  END IF;

  IF NOT public.can_manage_event_tee_sheet(p_event_id) THEN
    RAISE EXCEPTION 'Permission denied to publish tee times for this event';
  END IF;

  UPDATE public.events
  SET tee_time_start        = COALESCE(NULLIF(TRIM(p_start_time), ''), '08:00'),
      tee_time_interval     = COALESCE(p_interval, 10),
      tee_time_published_at = now()
  WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found: %', p_event_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
