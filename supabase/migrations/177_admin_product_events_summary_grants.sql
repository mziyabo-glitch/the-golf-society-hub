-- Restrict admin_product_events_summary EXECUTE to authenticated role only.
-- Internal is_platform_admin() check remains the authorization gate for data access.

REVOKE EXECUTE ON FUNCTION public.admin_product_events_summary(integer) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.admin_product_events_summary(integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_product_events_summary(integer) TO authenticated;
