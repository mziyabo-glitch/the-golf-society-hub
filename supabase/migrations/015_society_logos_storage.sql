-- =====================================================
-- SOCIETY LOGOS STORAGE BUCKET AND POLICIES
-- Run this in Supabase SQL Editor
-- =====================================================

-- Note: The logo_url column already exists in societies table
-- This migration sets up the storage bucket and policies

-- =====================================================
-- CREATE STORAGE BUCKET (run in Supabase Dashboard or via API)
-- =====================================================

-- Insert the bucket if it doesn't exist
-- Note: You may need to create this manually in Supabase Dashboard:
-- Storage > Create new bucket > Name: "society-logos" > Public: true

-- Storage bucket creation is typically done via Dashboard:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Click "Create a new bucket"
-- 3. Name: society-logos
-- 4. Public bucket: Enable (for easy access in PDF generation)
-- 5. Allowed MIME types: image/jpeg, image/png, image/gif, image/webp
-- 6. Max file size: 2MB

-- =====================================================
-- STORAGE POLICIES (RLS for storage)
-- =====================================================
-- These policies are set in Dashboard > Storage > Policies
-- Or use the SQL below with the storage schema

-- Allow authenticated users to read logos from public bucket
-- (Already handled by public bucket setting)

-- Allow society captains/secretaries to upload logos
-- Policy: INSERT for authenticated users where path starts with society ID they belong to

-- Allow society captains/secretaries to delete logos
-- Policy: DELETE for authenticated users where path matches their society

-- =====================================================
-- HELPER FUNCTION: Check if user can manage society logo
-- =====================================================

CREATE OR REPLACE FUNCTION can_manage_society_logo(p_society_id uuid)
RETURNS boolean AS $$
BEGIN
  -- Check if the current user is a captain or secretary of the society
  RETURN EXISTS (
    SELECT 1 FROM public.members
    WHERE society_id = p_society_id
      AND user_id = auth.uid()
      AND role IN ('captain', 'secretary')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- UPDATE SOCIETY POLICY TO ALLOW CAPTAIN/SECRETARY UPDATES
-- =====================================================

-- Drop existing update policy
DROP POLICY IF EXISTS societies_update_creator ON public.societies;
DROP POLICY IF EXISTS societies_update_manco ON public.societies;

-- Create new policy: Allow creator OR captain/secretary to update
CREATE POLICY societies_update_manco
  ON public.societies
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR can_manage_society_logo(id)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR can_manage_society_logo(id)
  );

-- =====================================================
-- NOTES FOR MANUAL STORAGE SETUP
-- =====================================================
--
-- After creating the bucket in Dashboard, add these storage policies:
--
-- 1. SELECT policy (read):
--    Policy name: Allow public read
--    Target roles: authenticated, anon
--    USING: true
--
-- 2. INSERT policy (upload):
--    Policy name: Allow captain/secretary upload
--    Target roles: authenticated
--    WITH CHECK: (bucket_id = 'society-logos' AND (storage.foldername(name))[1]::uuid IN (
--      SELECT society_id FROM public.members
--      WHERE user_id = auth.uid() AND role IN ('captain', 'secretary')
--    ))
--
-- 3. DELETE policy (remove):
--    Policy name: Allow captain/secretary delete
--    Target roles: authenticated
--    USING: (bucket_id = 'society-logos' AND (storage.foldername(name))[1]::uuid IN (
--      SELECT society_id FROM public.members
--      WHERE user_id = auth.uid() AND role IN ('captain', 'secretary')
--    ))
--
