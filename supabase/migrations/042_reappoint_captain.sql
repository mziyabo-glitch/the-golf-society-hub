-- 042_reappoint_captain.sql
-- Platform admin infrastructure + Re-appoint Captain support tool.

-- ============================================================================
-- 1. Platform admins table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_admins_select ON public.platform_admins;
CREATE POLICY platform_admins_select
  ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- 2. is_platform_admin() helper
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $ipad$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()
  )
$ipad$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

-- ============================================================================
-- 3. Audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_role_changes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id              uuid NOT NULL REFERENCES public.societies(id) ON DELETE CASCADE,
  old_captain_member_id   uuid REFERENCES public.members(id),
  new_captain_member_id   uuid NOT NULL REFERENCES public.members(id),
  changed_by_user_id      uuid NOT NULL,
  reason                  text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_role_changes_society
  ON public.admin_role_changes (society_id);

ALTER TABLE public.admin_role_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_role_changes_select ON public.admin_role_changes;
CREATE POLICY admin_role_changes_select
  ON public.admin_role_changes FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ============================================================================
-- 4. reappoint_captain RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.reappoint_captain(uuid, uuid, text);

CREATE FUNCTION public.reappoint_captain(
  p_society_id             uuid,
  p_new_captain_member_id  uuid,
  p_reason                 text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $rc$
DECLARE
  v_uid              uuid := auth.uid();
  v_old_captain_id   uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE id = p_new_captain_member_id AND society_id = p_society_id
  ) THEN
    RAISE EXCEPTION 'Member not found in this society';
  END IF;

  SELECT id INTO v_old_captain_id
    FROM public.members
   WHERE society_id = p_society_id AND upper(role) = 'CAPTAIN'
   LIMIT 1;

  IF v_old_captain_id IS NOT NULL THEN
    UPDATE public.members SET role = 'member' WHERE id = v_old_captain_id;
  END IF;

  UPDATE public.members SET role = 'captain' WHERE id = p_new_captain_member_id;

  INSERT INTO public.admin_role_changes
    (society_id, old_captain_member_id, new_captain_member_id, changed_by_user_id, reason)
  VALUES
    (p_society_id, v_old_captain_id, p_new_captain_member_id, v_uid, coalesce(nullif(trim(p_reason),''), 'Re-appointed via admin tool'));
END
$rc$;

GRANT EXECUTE ON FUNCTION public.reappoint_captain(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
