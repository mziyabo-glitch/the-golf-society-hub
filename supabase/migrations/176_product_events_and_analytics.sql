-- Product analytics events (Phase 1) + live gross scoring flag + admin report RPC.
-- Non-destructive: new table and column only.

CREATE TABLE IF NOT EXISTS public.product_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name       text        NOT NULL,
  user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  society_id       uuid        REFERENCES public.societies(id) ON DELETE SET NULL,
  screen           text,
  feature          text,
  related_event_id uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  user_role        text,
  platform         text,
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_events IS
  'Append-only product analytics. No PII in metadata — use ids and counts only.';

CREATE INDEX IF NOT EXISTS idx_product_events_created_at
  ON public.product_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_event_name_created
  ON public.product_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_society_created
  ON public.product_events (society_id, created_at DESC)
  WHERE society_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_user_created
  ON public.product_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_related_event
  ON public.product_events (related_event_id, created_at DESC)
  WHERE related_event_id IS NOT NULL;

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_events_insert ON public.product_events;
CREATE POLICY product_events_insert ON public.product_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS product_events_select_platform_admin ON public.product_events;
CREATE POLICY product_events_select_platform_admin ON public.product_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Live gross scoring: hidden in UI unless explicitly enabled per event.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS live_gross_scoring_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.live_gross_scoring_enabled IS
  'When true, ManCo gross score entry / publish quick actions are shown for this event.';

-- Platform admin analytics summary (7/30/90 day windows).
CREATE OR REPLACE FUNCTION public.admin_product_events_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(p_days, 365)));
  v_result jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'platform admin only';
  END IF;

  SELECT jsonb_build_object(
    'since', v_since,
    'days', p_days,
    'totals', (
      SELECT jsonb_build_object(
        'events', count(*),
        'unique_users', count(DISTINCT user_id)
      )
      FROM public.product_events
      WHERE created_at >= v_since
    ),
    'by_event_name', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'count')::bigint DESC)
      FROM (
        SELECT jsonb_build_object(
          'event_name', event_name,
          'count', count(*),
          'unique_users', count(DISTINCT user_id),
          'last_at', max(created_at)
        ) AS row
        FROM public.product_events
        WHERE created_at >= v_since
        GROUP BY event_name
      ) s
    ), '[]'::jsonb),
    'errors_by_screen', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'count')::bigint DESC)
      FROM (
        SELECT jsonb_build_object(
          'screen', COALESCE(screen, '(unknown)'),
          'count', count(*),
          'last_at', max(created_at)
        ) AS row
        FROM public.product_events
        WHERE created_at >= v_since AND event_name = 'error_shown'
        GROUP BY screen
      ) s
    ), '[]'::jsonb),
    'exports', COALESCE((
      SELECT jsonb_build_object(
        'count', count(*),
        'unique_users', count(DISTINCT user_id),
        'last_at', max(created_at)
      )
      FROM public.product_events
      WHERE created_at >= v_since AND event_name = 'export_completed'
    ), '{}'::jsonb),
    'tee_sheet', COALESCE((
      SELECT jsonb_build_object(
        'opened', count(*) FILTER (WHERE event_name = 'tee_sheet_opened'),
        'saved', count(*) FILTER (WHERE event_name = 'tee_sheet_saved'),
        'published', count(*) FILTER (WHERE event_name = 'tee_sheet_published'),
        'last_saved_at', max(created_at) FILTER (WHERE event_name = 'tee_sheet_saved'),
        'last_published_at', max(created_at) FILTER (WHERE event_name = 'tee_sheet_published')
      )
      FROM public.product_events
      WHERE created_at >= v_since
        AND event_name IN ('tee_sheet_opened', 'tee_sheet_saved', 'tee_sheet_published')
    ), '{}'::jsonb),
    'rsvp_payment', COALESCE((
      SELECT jsonb_build_object(
        'rsvp_submitted', count(*) FILTER (WHERE event_name = 'event_rsvp_submitted'),
        'payment_marked', count(*) FILTER (WHERE event_name = 'payment_marked')
      )
      FROM public.product_events
      WHERE created_at >= v_since
        AND event_name IN ('event_rsvp_submitted', 'payment_marked')
    ), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_product_events_summary(integer) IS
  'Platform admin: aggregated product_events for usage report (screen views vs actions).';

GRANT EXECUTE ON FUNCTION public.admin_product_events_summary(integer) TO authenticated;
