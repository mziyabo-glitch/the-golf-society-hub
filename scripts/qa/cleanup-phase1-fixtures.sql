-- Cleanup Phase 1 Playwright QA fixtures only (QA Phase1 * societies / qa.phase1.* users).
-- Safe to re-run. Does not touch live M4/ZGS production societies.

DO $$
DECLARE
  qa_society_ids uuid[];
  qa_event_ids uuid[];
  qa_member_ids uuid[];
  qa_user_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO qa_society_ids
  FROM public.societies
  WHERE name LIKE 'QA Phase1 %';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO qa_event_ids
  FROM public.events
  WHERE society_id = ANY (qa_society_ids)
     OR name LIKE 'QA Phase1 %';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO qa_member_ids
  FROM public.members
  WHERE society_id = ANY (qa_society_ids)
     OR email LIKE 'qa.phase1.%@gsh-qa.test';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
  INTO qa_user_ids
  FROM auth.users
  WHERE email LIKE 'qa.phase1.%@gsh-qa.test';

  IF cardinality(qa_event_ids) > 0 THEN
    DELETE FROM public.tee_group_players WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.tee_groups WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.tee_sheet_player_policy WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_registrations WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_societies WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_entries WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_players WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_guests WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_payments WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_expenses WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_courses WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_course_holes WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_course_status_updates WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_divisions WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_player_hole_scores WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_player_rounds WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_prize_pool_splitter_scores WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_prize_pool_results WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_prize_pool_entries WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_prize_pool_managers WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.event_prize_pools WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.oom_awards WHERE event_id = ANY (qa_event_ids);
    DELETE FROM public.finance_entries WHERE event_id = ANY (qa_event_ids);
    UPDATE public.product_events SET related_event_id = NULL WHERE related_event_id = ANY (qa_event_ids);
    UPDATE public.birdies_leagues SET start_from_event_id = NULL WHERE start_from_event_id = ANY (qa_event_ids);
    DELETE FROM public.events WHERE id = ANY (qa_event_ids);
  END IF;

  IF cardinality(qa_member_ids) > 0 THEN
    UPDATE public.profiles
    SET active_member_id = NULL
    WHERE active_member_id = ANY (qa_member_ids);

    DELETE FROM public.calendar_feed_tokens WHERE member_id = ANY (qa_member_ids);
    DELETE FROM public.admin_role_changes
    WHERE old_captain_member_id = ANY (qa_member_ids)
       OR new_captain_member_id = ANY (qa_member_ids);
    DELETE FROM public.members WHERE id = ANY (qa_member_ids);
  END IF;

  IF cardinality(qa_society_ids) > 0 THEN
    UPDATE public.profiles
    SET active_society_id = NULL
    WHERE active_society_id = ANY (qa_society_ids);

    DELETE FROM public.product_events WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.finance_entries WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.licence_requests WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.calendar_feed_tokens WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.course_data_submissions WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.oom_champions WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.oom_awards WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.event_results WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.free_play_round_players
    WHERE round_id IN (SELECT id FROM public.free_play_rounds WHERE society_id = ANY (qa_society_ids));
    DELETE FROM public.free_play_rounds WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.birdies_leagues WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.admin_role_changes WHERE society_id = ANY (qa_society_ids);
    DELETE FROM public.societies WHERE id = ANY (qa_society_ids);
  END IF;

  IF cardinality(qa_user_ids) > 0 THEN
    DELETE FROM public.platform_admins WHERE user_id = ANY (qa_user_ids);
    DELETE FROM public.profiles WHERE id = ANY (qa_user_ids);
    DELETE FROM auth.identities WHERE user_id = ANY (qa_user_ids);
    DELETE FROM auth.users WHERE id = ANY (qa_user_ids);
  END IF;

  DELETE FROM public.qa_phase1_fixtures WHERE run_id = 'latest';
END $$;
