-- =====================================================
-- Allow any participant to delete a rivalry (sinbook)
-- Previously only creator could delete
-- =====================================================

DROP POLICY IF EXISTS sinbooks_delete ON public.sinbooks;

CREATE POLICY sinbooks_delete ON public.sinbooks
  FOR DELETE TO authenticated
  USING (public.is_sinbook_participant(id));
