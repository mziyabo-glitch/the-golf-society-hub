-- Joint tee sheet: full replace of event_entries for an event (delete all, insert fresh).
-- Fixes persistence when client-side updates skipped rows (missing event_entry_id) or RLS blocked updates
-- for participating-society ManCo. Same permission model as clear_joint_event_pairings / clear_tee_sheet_for_event.

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

  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND (
        (
          e.society_id IN (SELECT public.my_society_ids())
          AND public.has_role_in_society(e.society_id, ARRAY['captain', 'secretary', 'handicapper'])
        )
        OR EXISTS (
          SELECT 1 FROM public.event_societies es
          WHERE es.event_id = p_event_id
            AND es.society_id IN (SELECT public.my_society_ids())
            AND public.has_role_in_society(es.society_id, ARRAY['captain', 'secretary', 'handicapper'])
        )
      )
  ) THEN
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

GRANT EXECUTE ON FUNCTION public.replace_joint_event_tee_sheet_entries(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.replace_joint_event_tee_sheet_entries(uuid, jsonb) IS
  'Deletes all event_entries for event_id (with permission), then inserts rows from p_rows. Host or participating ManCo.';
