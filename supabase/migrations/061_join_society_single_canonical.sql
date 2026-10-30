-- 061: Remove ambiguous join_society overload. Keep single canonical 5-param function.
--
-- Problem: Two overloads (3-param and 5-param) cause Supabase/PostgREST to resolve
-- the wrong function in some cases, leading to join flow errors.
--
-- Solution: Drop the legacy 3-param overload. The canonical function accepts:
--   p_join_code (required), p_name (required), p_email (optional),
--   p_handicap_index (optional), p_emergency_contact (optional)

DROP FUNCTION IF EXISTS public.join_society(text, text, text);
