-- PART B: FIX SECURITY — PROFILES RLS
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "auth_read_all" ON profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;

-- Only own profile + admin can read all
DROP POLICY IF EXISTS "own_profile_read" ON profiles;
CREATE POLICY "own_profile_read" ON profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "admin_read_all_profiles" ON profiles;
CREATE POLICY "admin_read_all_profiles" ON profiles
  FOR SELECT USING (public.is_admin());

-- Users can update ONLY their own profile (not the role column)
-- Note: We can't restrict specific columns in RLS, so prevent role escalation
-- by removing the general update policy and using a restricted function instead
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    -- Prevent role escalation: role must remain 'user' unless admin changes it
    (role = 'user' OR public.is_admin())
  );

-- PART C: FIX ENROLLMENT CODE RLS (students can see all codes)
-- Drop the public read policy (security flaw)
DROP POLICY IF EXISTS "public_read_active_codes" ON enrollment_codes;
DROP POLICY IF EXISTS "read_active_codes" ON enrollment_codes;
DROP POLICY IF EXISTS "anyone_read_active" ON enrollment_codes;

-- Students should NEVER be able to see enrollment codes
-- The use_chapter_enrollment_code RPC validates codes server-side
-- No direct table access needed for students
CREATE POLICY "admin_only_enrollment_codes" ON enrollment_codes
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- PART D: FIX ACTIVITY_LOGS RLS (unauthenticated spam)
DROP POLICY IF EXISTS "anyone_insert" ON activity_logs;
DROP POLICY IF EXISTS "auth_insert_logs" ON activity_logs;
CREATE POLICY "auth_insert_logs" ON activity_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = auth.uid()  -- Can only log own actions
  );
