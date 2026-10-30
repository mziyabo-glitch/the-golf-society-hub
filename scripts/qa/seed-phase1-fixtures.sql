-- Phase 1 Playwright QA fixtures (isolated "QA Phase1 *" societies only).
-- Re-runnable. Does not modify live M4/ZGS societies.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.qa_phase1_fixtures (
  run_id text PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inline cleanup (same scope as cleanup-phase1-fixtures.sql)
DO $$
DECLARE
  qa_society_ids uuid[];
  qa_event_ids uuid[];
  qa_member_ids uuid[];
  qa_user_ids uuid[];
BEGIN
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO qa_society_ids
  FROM public.societies WHERE name LIKE 'QA Phase1 %';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO qa_event_ids
  FROM public.events
  WHERE society_id = ANY (qa_society_ids) OR name LIKE 'QA Phase1 %';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO qa_member_ids
  FROM public.members
  WHERE society_id = ANY (qa_society_ids) OR email LIKE 'qa.phase1.%@gsh-qa.test';

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO qa_user_ids
  FROM auth.users WHERE email LIKE 'qa.phase1.%@gsh-qa.test';

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
    UPDATE public.profiles SET active_member_id = NULL WHERE active_member_id = ANY (qa_member_ids);
    DELETE FROM public.calendar_feed_tokens WHERE member_id = ANY (qa_member_ids);
    DELETE FROM public.admin_role_changes
    WHERE old_captain_member_id = ANY (qa_member_ids) OR new_captain_member_id = ANY (qa_member_ids);
    DELETE FROM public.members WHERE id = ANY (qa_member_ids);
  END IF;

  IF cardinality(qa_society_ids) > 0 THEN
    UPDATE public.profiles SET active_society_id = NULL WHERE active_society_id = ANY (qa_society_ids);
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
END $$;

DO $$
DECLARE
  v_run text := 'phase1-' || to_char(now() AT TIME ZONE 'utc', 'YYYYMMDDHH24MISS');
  v_password text := crypt('QaPhase1Test!2026', gen_salt('bf'));
  v_instance uuid := '00000000-0000-0000-0000-000000000000';

  u_m4 uuid := gen_random_uuid();
  u_zgs uuid := gen_random_uuid();
  u_dual uuid := gen_random_uuid();
  u_member uuid := gen_random_uuid();
  u_admin uuid := gen_random_uuid();
  u_other uuid := gen_random_uuid();

  s_m4 uuid := gen_random_uuid();
  s_zgs uuid := gen_random_uuid();
  s_other uuid := gen_random_uuid();

  m_m4_captain uuid := gen_random_uuid();
  m_zgs_captain uuid := gen_random_uuid();
  m_dual_m4 uuid := gen_random_uuid();
  m_dual_zgs uuid := gen_random_uuid();
  m_member uuid := gen_random_uuid();
  m_other_captain uuid := gen_random_uuid();
  m_paid uuid := gen_random_uuid();
  m_unpaid uuid := gen_random_uuid();
  m_late uuid := gen_random_uuid();
  m_zgs_paid uuid := gen_random_uuid();

  e_m4 uuid := gen_random_uuid();
  e_zgs uuid := gen_random_uuid();
  e_joint uuid := gen_random_uuid();
  e_other uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
  ) VALUES
    (v_instance, u_m4, 'authenticated', 'authenticated', 'qa.phase1.m4captain@gsh-qa.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"QA M4 Captain"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_zgs, 'authenticated', 'authenticated', 'qa.phase1.zgscaptain@gsh-qa.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"QA ZGS Captain"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_dual, 'authenticated', 'authenticated', 'qa.phase1.dual@gsh-qa.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"QA Dual Member"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_member, 'authenticated', 'authenticated', 'qa.phase1.member@gsh-qa.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"QA Ordinary Member"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_admin, 'authenticated', 'authenticated', 'qa.phase1.platformadmin@gsh-qa.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"QA Platform Admin"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_other, 'authenticated', 'authenticated', 'qa.phase1.othercaptain@gsh-qa.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"QA Other Captain"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false);

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email', id::text, now(), now(), now()
  FROM auth.users
  WHERE email LIKE 'qa.phase1.%@gsh-qa.test';

  INSERT INTO public.platform_admins (user_id) VALUES (u_admin) ON CONFLICT DO NOTHING;

  INSERT INTO public.societies (id, name, country, join_code, created_by, created_at)
  VALUES
    (s_m4, 'QA Phase1 M4 Society', 'GB', upper(substr(replace(s_m4::text,'-',''),1,6)), u_m4, now()),
    (s_zgs, 'QA Phase1 ZGS Society', 'GB', upper(substr(replace(s_zgs::text,'-',''),1,6)), u_zgs, now()),
    (s_other, 'QA Phase1 Other Society', 'GB', upper(substr(replace(s_other::text,'-',''),1,6)), u_other, now());

  INSERT INTO public.members (
    id, society_id, user_id, name, display_name, role, email,
    paid, amount_paid_pence, annual_fee_paid, has_seat, handicap_lock, created_at
  ) VALUES
    (m_m4_captain, s_m4, u_m4, 'QA M4 Captain', 'QA M4 Captain', 'captain', 'qa.phase1.m4captain@gsh-qa.test', true, 0, true, true, false, now()),
    (m_zgs_captain, s_zgs, u_zgs, 'QA ZGS Captain', 'QA ZGS Captain', 'captain', 'qa.phase1.zgscaptain@gsh-qa.test', true, 0, true, true, false, now()),
    (m_dual_m4, s_m4, u_dual, 'QA Dual Member', 'QA Dual Member', 'member', 'qa.phase1.dual@gsh-qa.test', true, 0, true, true, false, now()),
    (m_dual_zgs, s_zgs, u_dual, 'QA Dual Member', 'QA Dual Member', 'member', 'qa.phase1.dual@gsh-qa.test', true, 0, true, true, false, now()),
    (m_member, s_m4, u_member, 'QA Ordinary Member', 'QA Ordinary Member', 'member', 'qa.phase1.member@gsh-qa.test', true, 0, true, true, false, now()),
    (m_other_captain, s_other, u_other, 'QA Other Captain', 'QA Other Captain', 'captain', 'qa.phase1.othercaptain@gsh-qa.test', true, 0, true, true, false, now()),
    (m_paid, s_m4, NULL, 'QA Paid Player', 'QA Paid Player', 'member', NULL, true, 0, true, true, false, now()),
    (m_unpaid, s_m4, NULL, 'QA Unpaid Player', 'QA Unpaid Player', 'member', NULL, true, 0, true, true, false, now()),
    (m_late, s_m4, NULL, 'QA Late Paid Player', 'QA Late Paid Player', 'member', NULL, true, 0, true, true, false, now()),
    (m_zgs_paid, s_zgs, NULL, 'QA ZGS Paid Player', 'QA ZGS Paid Player', 'member', NULL, true, 0, true, true, false, now());

  INSERT INTO public.profiles (id, display_name, full_name, email, profile_complete, active_society_id, active_member_id)
  VALUES
    (u_m4, 'QA M4 Captain', 'QA M4 Captain', 'qa.phase1.m4captain@gsh-qa.test', true, s_m4, m_m4_captain),
    (u_zgs, 'QA ZGS Captain', 'QA ZGS Captain', 'qa.phase1.zgscaptain@gsh-qa.test', true, s_zgs, m_zgs_captain),
    (u_dual, 'QA Dual Member', 'QA Dual Member', 'qa.phase1.dual@gsh-qa.test', true, s_m4, m_dual_m4),
    (u_member, 'QA Ordinary Member', 'QA Ordinary Member', 'qa.phase1.member@gsh-qa.test', true, s_m4, m_member),
    (u_admin, 'QA Platform Admin', 'QA Platform Admin', 'qa.phase1.platformadmin@gsh-qa.test', true, NULL, NULL),
    (u_other, 'QA Other Captain', 'QA Other Captain', 'qa.phase1.othercaptain@gsh-qa.test', true, s_other, m_other_captain)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    full_name = EXCLUDED.full_name,
    profile_complete = true,
    active_society_id = EXCLUDED.active_society_id,
    active_member_id = EXCLUDED.active_member_id;

  INSERT INTO public.events (
    id, society_id, name, date, format, classification, is_oom, is_completed,
    nearest_pin_holes, longest_drive_holes, tee_time_start, tee_time_interval,
    created_by, created_at
  ) VALUES (
    e_m4, s_m4, 'QA Phase1 M4 Standard Event', current_date + 14, 'stableford', 'general', false, false,
    ARRAY[7,15]::integer[], ARRAY[3]::integer[], '08:00', 10, u_m4, now()
  );

  INSERT INTO public.events (
    id, society_id, name, date, format, classification, is_oom, is_completed, created_by, created_at
  ) VALUES
    (e_zgs, s_zgs, 'QA Phase1 ZGS Standard Event', current_date + 15, 'stableford', 'general', false, false, u_zgs, now()),
    (e_other, s_other, 'QA Phase1 Other Society Event', current_date + 16, 'stableford', 'general', false, false, u_other, now());

  INSERT INTO public.events (
    id, society_id, name, date, format, classification, is_oom, is_completed, is_joint_event, is_multi_society, created_by, created_at
  ) VALUES (
    e_joint, s_m4, 'QA Phase1 Joint M4/ZGS Event', current_date + 17, 'stableford', 'general', false, false, true, true, u_m4, now()
  );

  INSERT INTO public.event_societies (event_id, society_id, role, has_society_oom)
  VALUES
    (e_joint, s_m4, 'host', true),
    (e_joint, s_zgs, 'participant', true);

  INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid, created_at, updated_at)
  VALUES
    (s_m4, e_m4, m_paid, 'in', true, now(), now()),
    (s_m4, e_m4, m_unpaid, 'in', false, now(), now()),
    (s_m4, e_m4, m_late, 'in', false, now(), now()),
    (s_m4, e_m4, m_dual_m4, 'in', true, now(), now()),
    (s_m4, e_m4, m_member, 'in', true, now(), now()),
    (s_zgs, e_zgs, m_zgs_paid, 'in', true, now(), now()),
    (s_zgs, e_zgs, m_dual_zgs, 'in', true, now(), now()),
    (s_m4, e_joint, m_paid, 'in', true, now(), now()),
    (s_m4, e_joint, m_dual_m4, 'in', true, now(), now()),
    (s_zgs, e_joint, m_zgs_paid, 'in', true, now(), now()),
    (s_zgs, e_joint, m_dual_zgs, 'in', true, now(), now());

  INSERT INTO public.qa_phase1_fixtures (run_id, payload)
  VALUES (
    'latest',
    jsonb_build_object(
      'run', v_run,
      'password', 'QaPhase1Test!2026',
      'baseUrlHint', 'https://the-golf-society-hub.vercel.app',
      'accounts', jsonb_build_object(
        'm4Captain', jsonb_build_object('email','qa.phase1.m4captain@gsh-qa.test','userId',u_m4,'memberId',m_m4_captain,'societyId',s_m4),
        'zgsCaptain', jsonb_build_object('email','qa.phase1.zgscaptain@gsh-qa.test','userId',u_zgs,'memberId',m_zgs_captain,'societyId',s_zgs),
        'dual', jsonb_build_object('email','qa.phase1.dual@gsh-qa.test','userId',u_dual,'m4MemberId',m_dual_m4,'zgsMemberId',m_dual_zgs,'societyId',s_m4),
        'ordinaryMember', jsonb_build_object('email','qa.phase1.member@gsh-qa.test','userId',u_member,'memberId',m_member,'societyId',s_m4),
        'platformAdmin', jsonb_build_object('email','qa.phase1.platformadmin@gsh-qa.test','userId',u_admin),
        'otherCaptain', jsonb_build_object('email','qa.phase1.othercaptain@gsh-qa.test','userId',u_other,'memberId',m_other_captain,'societyId',s_other)
      ),
      'societies', jsonb_build_object('m4', s_m4, 'zgs', s_zgs, 'other', s_other),
      'events', jsonb_build_object('m4Standard', e_m4, 'zgsStandard', e_zgs, 'joint', e_joint, 'other', e_other),
      'players', jsonb_build_object(
        'paid', jsonb_build_object('id', m_paid, 'name', 'QA Paid Player'),
        'unpaid', jsonb_build_object('id', m_unpaid, 'name', 'QA Unpaid Player'),
        'late', jsonb_build_object('id', m_late, 'name', 'QA Late Paid Player'),
        'zgsPaid', jsonb_build_object('id', m_zgs_paid, 'name', 'QA ZGS Paid Player'),
        'dualM4', jsonb_build_object('id', m_dual_m4, 'name', 'QA Dual Member'),
        'dualZgs', jsonb_build_object('id', m_dual_zgs, 'name', 'QA Dual Member'),
        'ordinary', jsonb_build_object('id', m_member, 'name', 'QA Ordinary Member')
      )
    )
  )
  ON CONFLICT (run_id) DO UPDATE SET payload = EXCLUDED.payload, created_at = now();
END $$;

SELECT payload FROM public.qa_phase1_fixtures WHERE run_id = 'latest';
