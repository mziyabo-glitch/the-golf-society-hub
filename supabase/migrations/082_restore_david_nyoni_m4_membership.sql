-- 082: One-off data repair — restore David Nyoni membership in M4.
--
-- Notes:
-- - This schema does NOT have a `society_members` table; society linkage is `public.members`.
-- - We prefer re-linking an existing M4 `members` row (preserves registrations/payments/results)
--   over creating a new row.
-- - Idempotent: safe to run multiple times.

DO $$
DECLARE
  v_target_name text := 'david nyoni';
  v_m4_society_id uuid;
  v_m4_society_name text;

  v_primary_member_id uuid;
  v_primary_user_id uuid;
  v_primary_profile_id uuid;
  v_primary_profile_email text;

  v_existing_m4_member_id uuid;
  v_existing_m4_user_id uuid;

  v_reused_profile_id uuid;
  v_result_member_id uuid;
  v_missing_piece text := 'unknown';
BEGIN
  -- Resolve M4 society.
  SELECT s.id, s.name
    INTO v_m4_society_id, v_m4_society_name
  FROM public.societies s
  WHERE lower(trim(coalesce(s.name, ''))) LIKE '%m4%'
  ORDER BY s.created_at ASC
  LIMIT 1;

  IF v_m4_society_id IS NULL THEN
    RAISE EXCEPTION 'M4 society not found (name LIKE %%m4%%).';
  END IF;

  -- Best-known David member row anywhere (prefer linked row).
  SELECT m.id, m.user_id
    INTO v_primary_member_id, v_primary_user_id
  FROM public.members m
  WHERE
    lower(trim(coalesce(m.name, ''))) = v_target_name
    OR lower(trim(coalesce(m.display_name, ''))) = v_target_name
    OR lower(trim(coalesce(m.email, ''))) LIKE '%david%nyoni%'
  ORDER BY
    CASE WHEN m.user_id IS NOT NULL THEN 0 ELSE 1 END,
    m.created_at ASC
  LIMIT 1;

  -- Fallback: locate David's profile even when no members row is found.
  SELECT p.id, p.email
    INTO v_primary_profile_id, v_primary_profile_email
  FROM public.profiles p
  WHERE
    lower(trim(coalesce(p.full_name, ''))) = v_target_name
    OR lower(trim(coalesce(p.email, ''))) LIKE '%david%nyoni%'
  ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_primary_user_id IS NULL THEN
    v_primary_user_id := v_primary_profile_id;
  END IF;

  -- Existing M4 row for David (preserve this row to keep history references).
  SELECT m.id, m.user_id
    INTO v_existing_m4_member_id, v_existing_m4_user_id
  FROM public.members m
  WHERE
    m.society_id = v_m4_society_id
    AND (
      lower(trim(coalesce(m.name, ''))) = v_target_name
      OR lower(trim(coalesce(m.display_name, ''))) = v_target_name
      OR (
        v_primary_user_id IS NOT NULL
        AND m.user_id = v_primary_user_id
      )
    )
  ORDER BY m.created_at ASC
  LIMIT 1;

  IF v_existing_m4_member_id IS NOT NULL THEN
    -- Reuse existing M4 row; claim linkage if missing.
    IF v_existing_m4_user_id IS NULL AND v_primary_user_id IS NOT NULL THEN
      UPDATE public.members
         SET user_id = v_primary_user_id
       WHERE id = v_existing_m4_member_id;
      v_missing_piece := 'member_row_present_but_user_link_missing';
    ELSE
      v_missing_piece := 'member_row_present';
    END IF;
    v_result_member_id := v_existing_m4_member_id;
  ELSE
    -- No M4 row found: clone membership if present, else create from profile fallback.
    IF v_primary_member_id IS NOT NULL THEN
      INSERT INTO public.members (
        society_id,
        user_id,
        name,
        display_name,
        email,
        role,
        paid,
        annual_fee_paid,
        amount_paid_pence,
        handicap_index,
        whs_number,
        gender,
        emergency_contact
      )
      SELECT
        v_m4_society_id,
        coalesce(m.user_id, v_primary_user_id),
        m.name,
        m.display_name,
        m.email,
        coalesce(m.role, 'member'),
        coalesce(m.paid, false),
        coalesce(m.annual_fee_paid, false),
        coalesce(m.amount_paid_pence, 0),
        m.handicap_index,
        m.whs_number,
        m.gender,
        m.emergency_contact
      FROM public.members m
      WHERE m.id = v_primary_member_id
      RETURNING id INTO v_result_member_id;
      v_missing_piece := 'm4_member_row_missing_created_from_existing_member';
    ELSE
      INSERT INTO public.members (
        society_id,
        user_id,
        name,
        display_name,
        email,
        role,
        paid,
        annual_fee_paid,
        amount_paid_pence
      )
      VALUES (
        v_m4_society_id,
        v_primary_user_id,
        'David Nyoni',
        'David Nyoni',
        v_primary_profile_email,
        'member',
        false,
        false,
        0
      )
      RETURNING id INTO v_result_member_id;
      v_missing_piece := 'm4_member_row_missing_created_from_profile_or_placeholder';
    END IF;
  END IF;

  -- Keep profile linkage coherent for this user when available.
  SELECT p.id
    INTO v_reused_profile_id
  FROM public.profiles p
  WHERE p.id = coalesce(v_primary_user_id, v_existing_m4_user_id)
  LIMIT 1;

  IF v_reused_profile_id IS NOT NULL THEN
    UPDATE public.profiles p
       SET active_member_id = CASE
             WHEN p.active_society_id = v_m4_society_id THEN v_result_member_id
             ELSE p.active_member_id
           END
     WHERE p.id = v_reused_profile_id;
  END IF;

  RAISE NOTICE '[restore-david-m4] society=% (%), primary_member_id=%, primary_user_id=%',
    v_m4_society_name, v_m4_society_id, v_primary_member_id, v_primary_user_id;
  RAISE NOTICE '[restore-david-m4] primary_profile_id=%, primary_profile_email=%',
    v_primary_profile_id, v_primary_profile_email;
  RAISE NOTICE '[restore-david-m4] profile_id_reused=%, missing_piece=%',
    v_reused_profile_id, v_missing_piece;
  RAISE NOTICE '[restore-david-m4] final_m4_member_id=%',
    v_result_member_id;
END
$$;

