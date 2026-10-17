-- Remote DBs may define courses_enrichment_status_check with a fixed set that did not include
-- 'imported'. Drop the check so API imports can set enrichment_status freely (still text).

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_enrichment_status_check;

NOTIFY pgrst, 'reload schema';
