-- v1 rule: marking a member paid implies they are confirmed (attending).
-- When p_paid is true, set status = 'in'. Unpaid does not change status.
--
-- Must DROP first: CREATE OR REPLACE cannot rename parameters (e.g. p_member_id vs p_target_member_id).

DROP FUNCTION IF EXISTS public.mark_event_paid(uuid, uuid, boolean, integer);

CREATE FUNCTION public.mark_event_paid(
  p_event_id          uuid,
  p_target_member_id  uuid,
  p_paid              boolean,
  p_amount_pence      integer DEFAULT 0
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE
  v_uid        uuid := auth.uid();
  v_society_id uuid;
  v_caller_id  uuid;
  v_caller_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT e.society_id INTO v_society_id FROM public.events e WHERE e.id = p_event_id;
  IF v_society_id IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  SELECT m.id, m.role INTO v_caller_id, v_caller_role
    FROM public.members m
   WHERE m.society_id = v_society_id AND m.user_id = v_uid LIMIT 1;

  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Not a member of this society'; END IF;
  IF upper(coalesce(v_caller_role,'')) NOT IN ('CAPTAIN','TREASURER') THEN
    RAISE EXCEPTION 'Only Captain or Treasurer can mark payments';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.members WHERE id = p_target_member_id AND society_id = v_society_id) THEN
    RAISE EXCEPTION 'Target member not found in this society';
  END IF;

  INSERT INTO public.event_registrations
         (society_id, event_id, member_id, status, paid, amount_paid_pence, paid_at, marked_by_member_id)
  VALUES (v_society_id, p_event_id, p_target_member_id, 'in',
          p_paid,
          CASE WHEN p_paid THEN coalesce(p_amount_pence,0) ELSE 0 END,
          CASE WHEN p_paid THEN now() ELSE null END,
          v_caller_id)
  ON CONFLICT (event_id, member_id) DO UPDATE SET
    paid                  = EXCLUDED.paid,
    amount_paid_pence     = EXCLUDED.amount_paid_pence,
    paid_at               = EXCLUDED.paid_at,
    marked_by_member_id   = EXCLUDED.marked_by_member_id,
    status                = CASE WHEN EXCLUDED.paid THEN 'in' ELSE public.event_registrations.status END;
END
$f$;

COMMENT ON FUNCTION public.mark_event_paid(uuid, uuid, boolean, integer) IS
  'Captain/Treasurer: set paid flag. Paid=true forces status=in (confirmed). Paid=false does not change attendance.';

GRANT EXECUTE ON FUNCTION public.mark_event_paid(uuid, uuid, boolean, integer) TO authenticated;
