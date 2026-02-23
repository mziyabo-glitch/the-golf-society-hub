-- =====================================================
-- OOM CHAMPIONS STORAGE POLICIES
-- Path: societies/{society_id}/oom/{champion_id}.{ext}
-- =====================================================

-- Create bucket if not exists (Supabase allows this for storage)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'oom-champions',
  'oom-champions',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "oom_champions_manco_insert" ON storage.objects;
DROP POLICY IF EXISTS "oom_champions_manco_update" ON storage.objects;
DROP POLICY IF EXISTS "oom_champions_manco_delete" ON storage.objects;

-- Allow Captain/Secretary to INSERT into their society's oom folder
CREATE POLICY "oom_champions_manco_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'oom-champions'
    AND (storage.foldername(name))[1] = 'societies'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT society_id FROM public.members
      WHERE user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(role, ''))) IN ('captain', 'secretary')
    )
  );

-- Allow Captain/Secretary to UPDATE (required for upsert)
CREATE POLICY "oom_champions_manco_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'oom-champions'
    AND (storage.foldername(name))[1] = 'societies'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT society_id FROM public.members
      WHERE user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(role, ''))) IN ('captain', 'secretary')
    )
  );

-- Allow Captain/Secretary to DELETE
CREATE POLICY "oom_champions_manco_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'oom-champions'
    AND (storage.foldername(name))[1] = 'societies'
    AND (storage.foldername(name))[2]::uuid IN (
      SELECT society_id FROM public.members
      WHERE user_id = auth.uid()
      AND LOWER(TRIM(COALESCE(role, ''))) IN ('captain', 'secretary')
    )
  );

-- Allow SELECT for public bucket (images need to be viewable)
DROP POLICY IF EXISTS "oom_champions_anon_select" ON storage.objects;
CREATE POLICY "oom_champions_anon_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'oom-champions');

DROP POLICY IF EXISTS "oom_champions_auth_select" ON storage.objects;
CREATE POLICY "oom_champions_auth_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'oom-champions');
