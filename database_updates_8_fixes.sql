-- 1. Create missing RPCs for chapter access and enrollment

CREATE OR REPLACE FUNCTION check_chapter_access(
  p_chapter_id uuid,
  p_device_fingerprint text DEFAULT ''
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_role text;
  v_enrolled boolean;
BEGIN
  -- 1. Check if user is admin
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Check if user is enrolled (global enrollment or specific permissions)
  -- If your system uses a profile-level global 'is_enrolled' boolean, check it here:
  SELECT is_enrolled INTO v_enrolled FROM profiles WHERE id = auth.uid();
  IF v_enrolled THEN
    RETURN true;
  END IF;

  -- 3. Check for specific chapter code usage (requires a table for code uses)
  -- For now, if not admin and not globally enrolled, deny access.
  RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION use_chapter_enrollment_code(
  p_code text, p_chapter_id uuid,
  p_device_fingerprint text DEFAULT '',
  p_device_ip text DEFAULT '',
  p_device_user_agent text DEFAULT '',
  p_device_info jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
  v_code_record RECORD;
BEGIN
  -- Simple implementation checking enrollment_codes table
  SELECT * INTO v_code_record FROM enrollment_codes 
  WHERE code = p_code AND active = true AND (max_uses = 0 OR uses_count < max_uses);

  IF NOT FOUND THEN
    RETURN '{"success": false, "message_bn": "কোডটি অবৈধ বা মেয়াদোত্তীর্ণ"}'::jsonb;
  END IF;

  -- Here you would normally log the code usage to a code_usages table
  -- and grant specific chapter access. Since we use generic profile is_enrolled 
  -- for global access in this logic MVP:
  UPDATE profiles SET is_enrolled = true WHERE id = auth.uid();

  UPDATE enrollment_codes SET uses_count = uses_count + 1 WHERE id = v_code_record.id;

  RETURN '{"success": true, "message_bn": "এনরোলমেন্ট সফল হয়েছে"}'::jsonb;
END; $$;

-- 2. Add all missing columns that frontend queries expect
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS name_bn TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS slug TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thumbnail_color TEXT DEFAULT '';

ALTER TABLE cycles ADD COLUMN IF NOT EXISTS name_bn TEXT DEFAULT '';

ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS name_bn TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS requires_enrollment BOOLEAN DEFAULT false;

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS title_bn TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT 'video/mp4',
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_enrolled BOOLEAN DEFAULT false;

-- 3. Fix watch_history which was silently failing upserts
ALTER TABLE watch_history
  ADD COLUMN IF NOT EXISTS progress_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS watched_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 4. Add indices for foreign keys and queries
CREATE INDEX IF NOT EXISTS idx_watch_history_user_video ON watch_history(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_videos_chapter_id ON videos(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapters_cycle_id ON chapters(cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycles_subject_id ON cycles(subject_id);
-- Assuming quizzes and notifications exist
-- CREATE INDEX IF NOT EXISTS idx_quizzes_chapter_id ON quizzes(chapter_id);
-- CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
