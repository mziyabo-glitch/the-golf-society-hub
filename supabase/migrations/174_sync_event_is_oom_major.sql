-- Major events also award OOM points; keep is_oom in sync with classification.
CREATE OR REPLACE FUNCTION public.sync_event_is_oom()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.is_oom := (NEW.classification IN ('oom', 'major'));
  RETURN NEW;
END;
$$;
