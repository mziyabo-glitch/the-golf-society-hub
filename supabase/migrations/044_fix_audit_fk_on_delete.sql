-- 044_fix_audit_fk_on_delete.sql
-- Change admin_role_changes FK on member columns to ON DELETE SET NULL
-- so that deleting a member doesn't fail when they appear in the audit log.

ALTER TABLE public.admin_role_changes
  DROP CONSTRAINT IF EXISTS admin_role_changes_old_captain_member_id_fkey;

ALTER TABLE public.admin_role_changes
  DROP CONSTRAINT IF EXISTS admin_role_changes_new_captain_member_id_fkey;

-- new_captain_member_id must allow NULL now (was NOT NULL)
ALTER TABLE public.admin_role_changes
  ALTER COLUMN new_captain_member_id DROP NOT NULL;

ALTER TABLE public.admin_role_changes
  ADD CONSTRAINT admin_role_changes_old_captain_member_id_fkey
  FOREIGN KEY (old_captain_member_id) REFERENCES public.members(id) ON DELETE SET NULL;

ALTER TABLE public.admin_role_changes
  ADD CONSTRAINT admin_role_changes_new_captain_member_id_fkey
  FOREIGN KEY (new_captain_member_id) REFERENCES public.members(id) ON DELETE SET NULL;
