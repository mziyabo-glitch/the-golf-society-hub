-- Official scoring publish state: gross entry stays editable until publish writes event_results.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS scoring_results_status text NOT NULL DEFAULT 'draft'
    CHECK (scoring_results_status IN ('draft', 'published', 'reopened'));

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS scoring_published_at timestamptz;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS scoring_publish_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.events.scoring_results_status IS
  'draft: gross rounds editable, no official results from publish path. published: official event_results written from last publish. reopened: gross edits allowed again; prior society-scoped official rows cleared on reopen.';

COMMENT ON COLUMN public.events.scoring_published_at IS
  'When scoring_results_status last became published (republish updates this).';

COMMENT ON COLUMN public.events.scoring_publish_version IS
  'Incremented on each successful publish for audit / cache busting.';

NOTIFY pgrst, 'reload schema';
