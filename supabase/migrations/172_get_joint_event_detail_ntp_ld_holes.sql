-- Include competition holes in get_joint_event_detail so joint tee-sheet reload/export
-- sees persisted nearest_pin_holes / longest_drive_holes (added in 017).

CREATE OR REPLACE FUNCTION public.get_joint_event_detail(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_event_row        record;
  v_has_access       boolean;
  v_is_joint         boolean;
  v_host_society_id  uuid;
  v_participating    jsonb;
  v_entries          jsonb;
  v_scopes           jsonb;
  v_meta             jsonb;
  v_result           jsonb;
BEGIN
  SELECT
    e.id AS ev_id,
    e.name AS ev_name,
    e.date AS ev_date,
    e.format AS ev_format,
    e.classification AS ev_classification,
    e.society_id AS ev_society_id,
    e.course_id AS ev_course_id,
    e.status AS ev_status,
    e.created_by AS ev_created_by,
    e.created_at AS ev_created_at,
    e.tee_id AS ev_tee_id,
    e.course_name AS ev_course_name,
    e.tee_name AS ev_tee_name,
    e.par AS ev_par,
    e.course_rating AS ev_course_rating,
    e.slope_rating AS ev_slope_rating,
    e.handicap_allowance AS ev_handicap_allowance,
    e.ladies_tee_name AS ev_ladies_tee_name,
    e.ladies_par AS ev_ladies_par,
    e.ladies_course_rating AS ev_ladies_course_rating,
    e.ladies_slope_rating AS ev_ladies_slope_rating,
    e.tee_time_start AS ev_tee_time_start,
    e.tee_time_interval AS ev_tee_time_interval,
    e.tee_time_published_at AS ev_tee_time_published_at,
    e.nearest_pin_holes AS ev_nearest_pin_holes,
    e.longest_drive_holes AS ev_longest_drive_holes,
    e.tee_source AS ev_tee_source,
    e.income_pence AS ev_income_pence,
    e.costs_pence AS ev_costs_pence,
    e.is_completed AS ev_is_completed,
    e.is_oom AS ev_is_oom,
    e.rsvp_deadline_at AS ev_rsvp_deadline_at
  INTO v_event_row
  FROM public.events e
  WHERE e.id = p_event_id;

  IF v_event_row IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT (
    v_event_row.ev_society_id IN (SELECT public.my_society_ids())
    OR EXISTS (
      SELECT 1 FROM public.event_societies es
      WHERE es.event_id = p_event_id
        AND es.society_id IN (SELECT public.my_society_ids())
    )
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN NULL;
  END IF;

  SELECT (SELECT COUNT(DISTINCT es.society_id) FROM public.event_societies es WHERE es.event_id = p_event_id) >= 2
  INTO v_is_joint;

  SELECT COALESCE(
    (SELECT es.society_id FROM public.event_societies es
     WHERE es.event_id = p_event_id AND es.role = 'host' LIMIT 1),
    v_event_row.ev_society_id
  ) INTO v_host_society_id;

  IF v_is_joint THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'event_society_id', es.id,
          'society_id', es.society_id,
          'society_name', COALESCE(s.name, ''),
          'role', es.role,
          'has_society_oom', COALESCE(es.has_society_oom, true),
          'society_oom_name', COALESCE(es.society_oom_name, COALESCE(s.name, '') || ' OOM')
        )
        ORDER BY (CASE WHEN es.role = 'host' THEN 0 ELSE 1 END), s.name
      ),
      '[]'::jsonb
    ) INTO v_participating
    FROM public.event_societies es
    LEFT JOIN public.societies s ON s.id = es.society_id
    WHERE es.event_id = p_event_id;
  ELSE
    v_participating := '[]'::jsonb;
  END IF;

  IF v_is_joint THEN
    SELECT COALESCE(
      (SELECT jsonb_agg(s.entry_obj ORDER BY s.player_name_nullslast)
       FROM (
         SELECT
           jsonb_build_object(
             'event_entry_id', ee.id,
             'player_id', ee.player_id,
             'player_name', COALESCE(m.name, m.display_name, 'Player'),
             'tee_id', ee.tee_id,
             'tee_name', COALESCE(ct.tee_name, ''),
             'status', COALESCE(ee.status, 'confirmed'),
             'pairing_group', ee.pairing_group,
             'pairing_position', ee.pairing_position,
             'is_scoring', COALESCE(ee.is_scoring, false),
             'society_memberships', '[]'::jsonb,
             'eligibility', COALESCE(elig.arr, '[]'::jsonb)
           ) AS entry_obj,
           COALESCE(m.name, m.display_name, '') AS player_name_nullslast
         FROM public.event_entries ee
         LEFT JOIN public.members m ON m.id = ee.player_id
         LEFT JOIN public.course_tees ct ON ct.id = ee.tee_id
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(
             jsonb_build_object(
               'society_id', eese.society_id,
               'is_eligible_for_society_results', COALESCE(eese.is_eligible_for_society_results, true),
               'is_eligible_for_society_oom', COALESCE(eese.is_eligible_for_society_oom, true),
               'manual_override_reason', eese.manual_override_reason
             )
           ) AS arr
           FROM public.event_entry_society_eligibility eese
           WHERE eese.event_entry_id = ee.id
         ) elig ON true
         WHERE ee.event_id = p_event_id
       ) s),
      '[]'::jsonb
    ) INTO v_entries;
  ELSE
    v_entries := '[]'::jsonb;
  END IF;

  v_entries := COALESCE(v_entries, '[]'::jsonb);

  v_scopes := jsonb_build_array(
    jsonb_build_object(
      'scope_type', 'overall',
      'society_id', NULL,
      'label', 'Overall',
      'has_oom', (v_event_row.ev_is_oom IS NOT NULL AND v_event_row.ev_is_oom)
    )
  );

  IF v_is_joint AND v_participating IS NOT NULL AND jsonb_array_length(v_participating) > 0 THEN
    v_scopes := v_scopes || (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'scope_type', 'society',
          'society_id', (elem->>'society_id')::uuid,
          'label', COALESCE(elem->>'society_name', 'Society') || ' Results',
          'has_oom', COALESCE((elem->>'has_society_oom')::boolean, true)
        )
      ), '[]'::jsonb)
      FROM jsonb_array_elements(v_participating) AS elem
    );
  END IF;

  v_scopes := COALESCE(v_scopes, '[]'::jsonb);

  v_meta := jsonb_build_object(
    'can_manage_event', public.has_role_in_society(v_host_society_id, ARRAY['captain', 'secretary']),
    'can_score_event', public.has_role_in_society(v_host_society_id, ARRAY['captain', 'secretary', 'handicapper']),
    'can_publish_results', public.has_role_in_society(v_host_society_id, ARRAY['captain', 'handicapper']),
    'generated_at', now(),
    'has_entries', (v_entries IS NOT NULL AND jsonb_array_length(v_entries) > 0),
    'has_participating_societies', (v_participating IS NOT NULL AND jsonb_array_length(v_participating) > 0)
  );

  v_result := jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event_row.ev_id,
      'title', v_event_row.ev_name,
      'event_date', v_event_row.ev_date,
      'format', v_event_row.ev_format,
      'classification', v_event_row.ev_classification,
      'host_society_id', v_host_society_id,
      'society_id', v_event_row.ev_society_id,
      'is_joint_event', v_is_joint,
      'status', COALESCE(v_event_row.ev_status, 'upcoming'),
      'course_id', v_event_row.ev_course_id,
      'course_name', v_event_row.ev_course_name,
      'created_by', v_event_row.ev_created_by,
      'created_at', v_event_row.ev_created_at,
      'tee_id', v_event_row.ev_tee_id,
      'tee_name', v_event_row.ev_tee_name,
      'par', v_event_row.ev_par,
      'course_rating', v_event_row.ev_course_rating,
      'slope_rating', v_event_row.ev_slope_rating,
      'handicap_allowance', v_event_row.ev_handicap_allowance,
      'ladies_tee_name', v_event_row.ev_ladies_tee_name,
      'ladies_par', v_event_row.ev_ladies_par,
      'ladies_course_rating', v_event_row.ev_ladies_course_rating,
      'ladies_slope_rating', v_event_row.ev_ladies_slope_rating,
      'tee_time_start', v_event_row.ev_tee_time_start,
      'tee_time_interval', v_event_row.ev_tee_time_interval,
      'tee_time_published_at', v_event_row.ev_tee_time_published_at,
      'nearest_pin_holes', COALESCE(v_event_row.ev_nearest_pin_holes, '{}'::integer[]),
      'longest_drive_holes', COALESCE(v_event_row.ev_longest_drive_holes, '{}'::integer[]),
      'tee_source', v_event_row.ev_tee_source,
      'income_pence', v_event_row.ev_income_pence,
      'costs_pence', v_event_row.ev_costs_pence,
      'is_completed', v_event_row.ev_is_completed,
      'is_oom', v_event_row.ev_is_oom,
      'rsvp_deadline_at', v_event_row.ev_rsvp_deadline_at
    ),
    'participating_societies', COALESCE(v_participating, '[]'::jsonb),
    'entries', v_entries,
    'leaderboard_scopes', v_scopes,
    'meta', v_meta
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_joint_event_detail(uuid) IS
  'Joint event read model. Includes nearest_pin_holes and longest_drive_holes for tee sheet editor reload.';

GRANT EXECUTE ON FUNCTION public.get_joint_event_detail(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
