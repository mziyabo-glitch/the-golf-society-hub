-- Synthetic Staging M4 / Staging ZGS payment fixture.
-- Safe only on an empty local database after the payment migrations.
-- Aborts when any other society already exists, when the target is production
-- project eaenzjwecrrbhibrvgsb, or when the database host is not local.
-- Online payments stay off. No Stripe secret and no account password.
--
-- Required psql variables, supplied by scripts/payments/local-staging.sh:
--   staging_password, staging_db_host, staging_project_ref

\if :{?staging_password}
\else
\echo 'staging_seed_refused_missing_password: run scripts/payments/local-staging.sh setup'
DO $$ BEGIN RAISE EXCEPTION 'staging_seed_refused_missing_password'; END $$;
\quit
\endif

\if :{?staging_db_host}
\else
\echo 'staging_seed_refused_missing_host: run scripts/payments/local-staging.sh setup'
DO $$ BEGIN RAISE EXCEPTION 'staging_seed_refused_non_local_host'; END $$;
\quit
\endif

\if :{?staging_project_ref}
\else
\echo 'staging_seed_refused_missing_project_ref'
DO $$ BEGIN RAISE EXCEPTION 'staging_seed_refused_production_target'; END $$;
\quit
\endif

CREATE EXTENSION IF NOT EXISTS pgcrypto;

SELECT
  set_config('gsh.staging_password', :'staging_password', false) AS staging_password_set,
  set_config('gsh.staging_db_host', :'staging_db_host', false) AS staging_db_host_set,
  set_config('gsh.staging_project_ref', :'staging_project_ref', false) AS staging_project_ref_set
\gset

DO $seed$
DECLARE
  v_password text;
  v_host text := coalesce(current_setting('gsh.staging_db_host', true), '');
  v_ref text := coalesce(current_setting('gsh.staging_project_ref', true), '');
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  u_captain uuid := '21000000-0000-4000-8000-000000000001';
  u_treasurer uuid := '21000000-0000-4000-8000-000000000002';
  u_secretary uuid := '21000000-0000-4000-8000-000000000003';
  u_handicapper uuid := '21000000-0000-4000-8000-000000000004';
  u_player uuid := '21000000-0000-4000-8000-000000000005';
  u_zgs uuid := '21000000-0000-4000-8000-000000000006';
  s_m4 uuid := '22000000-0000-4000-8000-000000000001';
  s_zgs uuid := '22000000-0000-4000-8000-000000000002';
  m_captain uuid := '23000000-0000-4000-8000-000000000001';
  m_treasurer uuid := '23000000-0000-4000-8000-000000000002';
  m_secretary uuid := '23000000-0000-4000-8000-000000000003';
  m_handicapper uuid := '23000000-0000-4000-8000-000000000004';
  m_player uuid := '23000000-0000-4000-8000-000000000005';
  m_legacy uuid := '23000000-0000-4000-8000-000000000006';
  m_withdrawn uuid := '23000000-0000-4000-8000-000000000007';
  m_unregistered uuid := '23000000-0000-4000-8000-000000000008';
  m_zgs_treasurer uuid := '23000000-0000-4000-8000-000000000009';
  m_zgs_player uuid := '23000000-0000-4000-8000-000000000010';
  e_joint uuid := '24000000-0000-4000-8000-000000000001';
BEGIN
  IF coalesce(length(current_setting('gsh.staging_password', true)), 0) < 16 THEN
    RAISE EXCEPTION 'staging_seed_refused_missing_password';
  END IF;
  IF v_ref ILIKE '%eaenzjwecrrbhibrvgsb%'
     OR v_host ILIKE '%eaenzjwecrrbhibrvgsb%'
     OR v_host ILIKE '%.supabase.co'
     OR v_host ILIKE '%.supabase.com' THEN
    RAISE EXCEPTION 'staging_seed_refused_production_target';
  END IF;
  IF v_host NOT IN ('127.0.0.1', 'localhost', '::1') THEN
    RAISE EXCEPTION 'staging_seed_refused_non_local_host';
  END IF;
  IF inet_server_addr() IS NOT NULL
     AND NOT (
       inet_server_addr() << '127.0.0.0/8'::inet
       OR inet_server_addr() = '::1'::inet
       OR inet_server_addr() << '10.0.0.0/8'::inet
       OR inet_server_addr() << '172.16.0.0/12'::inet
       OR inet_server_addr() << '192.168.0.0/16'::inet
       OR inet_server_addr() << 'fc00::/7'::inet
       OR inet_server_addr() << 'fe80::/10'::inet
     ) THEN
    RAISE EXCEPTION 'staging_seed_refused_non_local_host';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.societies
     WHERE id NOT IN (s_m4, s_zgs)
  ) THEN
    RAISE EXCEPTION 'staging_seed_refused_non_empty_database';
  END IF;

  v_password := crypt(current_setting('gsh.staging_password'), gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, is_sso_user, is_anonymous
  ) VALUES
    (v_instance, u_captain, 'authenticated', 'authenticated', 'staging.m4.captain@gsh-staging.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging M4 Captain"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_treasurer, 'authenticated', 'authenticated', 'staging.m4.treasurer@gsh-staging.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging M4 Treasurer"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_secretary, 'authenticated', 'authenticated', 'staging.m4.secretary@gsh-staging.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging M4 Secretary"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_handicapper, 'authenticated', 'authenticated', 'staging.m4.handicapper@gsh-staging.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging M4 Handicapper"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_player, 'authenticated', 'authenticated', 'staging.m4.player@gsh-staging.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging M4 Player"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false),
    (v_instance, u_zgs, 'authenticated', 'authenticated', 'staging.zgs.treasurer@gsh-staging.test', v_password, now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Staging ZGS Treasurer"}'::jsonb, now(), now(),
     '', '', '', '', '', '', false, false)
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email = EXCLUDED.email,
    updated_at = now();

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), id,
    jsonb_build_object('sub', id::text, 'email', email),
    'email', id::text, now(), now(), now()
  FROM auth.users
  WHERE email LIKE 'staging.%@gsh-staging.test'
    AND NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = auth.users.id AND i.provider = 'email'
    );

  INSERT INTO public.societies (id, name, country, join_code, created_by, created_at, online_payments_enabled)
  VALUES
    (s_m4, 'Staging M4', 'GB', 'STGM4A', u_captain, now(), false),
    (s_zgs, 'Staging ZGS', 'GB', 'STGZGS', u_zgs, now(), false)
  ON CONFLICT (id) DO UPDATE
    SET online_payments_enabled = false,
        name = EXCLUDED.name;

  INSERT INTO public.members (
    id, society_id, user_id, name, display_name, role, email,
    paid, amount_paid_pence, annual_fee_paid, has_seat, handicap_lock, created_at
  ) VALUES
    (m_captain, s_m4, u_captain, 'Staging M4 Captain', 'Staging M4 Captain', 'captain', 'staging.m4.captain@gsh-staging.test', true, 0, true, true, false, now()),
    (m_treasurer, s_m4, u_treasurer, 'Staging M4 Treasurer', 'Staging M4 Treasurer', 'treasurer', 'staging.m4.treasurer@gsh-staging.test', true, 0, true, true, false, now()),
    (m_secretary, s_m4, u_secretary, 'Staging M4 Secretary', 'Staging M4 Secretary', 'secretary', 'staging.m4.secretary@gsh-staging.test', true, 0, true, true, false, now()),
    (m_handicapper, s_m4, u_handicapper, 'Staging M4 Handicapper', 'Staging M4 Handicapper', 'handicapper', 'staging.m4.handicapper@gsh-staging.test', true, 0, true, true, false, now()),
    (m_player, s_m4, u_player, 'Staging M4 Player', 'Staging M4 Player', 'member', 'staging.m4.player@gsh-staging.test', true, 0, true, true, false, now()),
    (m_legacy, s_m4, NULL, 'Staging Legacy Roster', 'Staging Legacy Roster', 'member', NULL, true, 0, true, true, false, now()),
    (m_withdrawn, s_m4, NULL, 'Staging Withdrawn', 'Staging Withdrawn', 'member', NULL, true, 0, true, true, false, now()),
    (m_unregistered, s_m4, NULL, 'Staging Unregistered', 'Staging Unregistered', 'member', NULL, true, 0, true, true, false, now()),
    (m_zgs_treasurer, s_zgs, u_zgs, 'Staging ZGS Treasurer', 'Staging ZGS Treasurer', 'treasurer', 'staging.zgs.treasurer@gsh-staging.test', true, 0, true, true, false, now()),
    (m_zgs_player, s_zgs, NULL, 'Staging ZGS Player', 'Staging ZGS Player', 'member', NULL, true, 0, true, true, false, now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, display_name, full_name, email, profile_complete, active_society_id, active_member_id)
  VALUES
    (u_captain, 'Staging M4 Captain', 'Staging M4 Captain', 'staging.m4.captain@gsh-staging.test', true, s_m4, m_captain),
    (u_treasurer, 'Staging M4 Treasurer', 'Staging M4 Treasurer', 'staging.m4.treasurer@gsh-staging.test', true, s_m4, m_treasurer),
    (u_secretary, 'Staging M4 Secretary', 'Staging M4 Secretary', 'staging.m4.secretary@gsh-staging.test', true, s_m4, m_secretary),
    (u_handicapper, 'Staging M4 Handicapper', 'Staging M4 Handicapper', 'staging.m4.handicapper@gsh-staging.test', true, s_m4, m_handicapper),
    (u_player, 'Staging M4 Player', 'Staging M4 Player', 'staging.m4.player@gsh-staging.test', true, s_m4, m_player),
    (u_zgs, 'Staging ZGS Treasurer', 'Staging ZGS Treasurer', 'staging.zgs.treasurer@gsh-staging.test', true, s_zgs, m_zgs_treasurer)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    active_society_id = EXCLUDED.active_society_id,
    active_member_id = EXCLUDED.active_member_id;

  INSERT INTO public.events (
    id, society_id, name, date, format, classification, is_oom, is_completed,
    player_ids, member_entry_fee_pence, guest_entry_fee_pence, joint_participant_entry_fee_pence,
    created_by, created_at
  ) VALUES (
    e_joint, s_m4, 'Staging M4 v ZGS', current_date + 21, 'stableford', 'general', false, false,
    ARRAY[m_legacy]::uuid[], 2500, 2500, 2500,
    u_captain, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    member_entry_fee_pence = 2500,
    guest_entry_fee_pence = 2500,
    joint_participant_entry_fee_pence = 2500,
    player_ids = ARRAY[m_legacy]::uuid[];

  INSERT INTO public.event_societies (event_id, society_id, role, has_society_oom)
  VALUES
    (e_joint, s_m4, 'host', true),
    (e_joint, s_zgs, 'participant', true)
  ON CONFLICT (event_id, society_id) DO NOTHING;

  INSERT INTO public.event_registrations (society_id, event_id, member_id, status, paid, amount_paid_pence, created_at, updated_at)
  VALUES
    (s_m4, e_joint, m_player, 'in', false, 0, now(), now()),
    (s_m4, e_joint, m_withdrawn, 'out', false, 0, now(), now()),
    (s_zgs, e_joint, m_zgs_player, 'in', false, 0, now(), now())
  ON CONFLICT (event_id, member_id) DO NOTHING;

  UPDATE public.event_registrations
     SET removed_from_event_at = now()
   WHERE event_id = e_joint
     AND member_id = m_withdrawn
     AND removed_from_event_at IS NULL;
END
$seed$;

SELECT set_config('gsh.staging_password', '', false) AS staging_password_cleared \gset
