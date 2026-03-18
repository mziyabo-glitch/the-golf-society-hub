-- 060_sinbook_title_backfill.sql
-- Backfill sidebets with null or empty titles to "Friendly Match"
-- Ensures stored title is always the single source of truth in the UI

UPDATE public.sinbooks
SET title = 'Friendly Match',
    updated_at = now()
WHERE title IS NULL OR trim(title) = '';
