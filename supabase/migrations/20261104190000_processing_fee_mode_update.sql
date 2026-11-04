-- Let a Captain or Treasurer save processing_fee_mode.
-- Column grants were snapshotted before this column existed, so authenticated
-- could not update it. Connect ownership columns stay revoked.
-- Two societies UPDATE policies read members directly. Members policies read
-- societies, so those policies raise infinite recursion and block every
-- society update, including the annual fee. Captain and Treasurer updates
-- already use security-definer helpers.

GRANT UPDATE (processing_fee_mode) ON TABLE public.societies TO authenticated;

DROP POLICY IF EXISTS "captain can update society logo_url" ON public.societies;
DROP POLICY IF EXISTS societies_update_opening_balance_captain_treasurer ON public.societies;
