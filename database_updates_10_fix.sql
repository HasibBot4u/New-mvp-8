-- FINAL SUPABASE FIXES
-- RUN THIS SCRIPT IN SUPABASE SQL EDITOR TO FIX ALL DB ERRORS

-- 1. ERROR B & A: SAFE DROP OF IS_ADMIN AND POLICIES
DROP POLICY IF EXISTS own_sel ON profiles;
DROP POLICY IF EXISTS adm_all ON profiles;
DROP POLICY IF EXISTS adm_all ON subjects;
DROP POLICY IF EXISTS adm_all ON cycles;
DROP POLICY IF EXISTS adm_all ON chapters;
DROP POLICY IF EXISTS adm_all ON videos;
DROP POLICY IF EXISTS adm_sel ON watch_history;
DROP POLICY IF EXISTS adm_all ON notifications;
DROP POLICY IF EXISTS adm_all ON announcements;
DROP POLICY IF EXISTS adm_all ON enrollment_codes;
DROP POLICY IF EXISTS adm_all ON chapter_access;
DROP POLICY IF EXISTS adm_all ON system_settings;

DROP FUNCTION IF EXISTS is_admin() CASCADE;

CREATE OR REPLACE FUNCTION is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = check_user_id AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin TO authenticated;

-- Safe policy creation using DO blocks for all tables
DO $$
BEGIN
  -- subjects: student read access (Error L: also allow anon)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='subjects' AND policyname='pub_sel') THEN
    EXECUTE 'CREATE POLICY pub_sel ON subjects FOR SELECT TO authenticated, anon USING (is_active = true)';
  END IF;

  -- cycles: student read access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cycles' AND policyname='pub_sel') THEN
    EXECUTE 'CREATE POLICY pub_sel ON cycles FOR SELECT TO authenticated, anon USING (is_active = true)';
  END IF;

  -- chapters: student read access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chapters' AND policyname='pub_sel') THEN
    EXECUTE 'CREATE POLICY pub_sel ON chapters FOR SELECT TO authenticated USING (is_active = true)';
  END IF;

  -- videos: student read access
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='videos' AND policyname='pub_sel') THEN
    EXECUTE 'CREATE POLICY pub_sel ON videos FOR SELECT TO authenticated USING (is_active = true)';
  END IF;

  -- announcements: student read
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='announcements' AND policyname='pub_sel') THEN
    EXECUTE 'CREATE POLICY pub_sel ON announcements FOR SELECT TO authenticated USING (is_active = true)';
  END IF;

  -- watch_history: own select
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watch_history' AND policyname='own_sel') THEN
    EXECUTE 'CREATE POLICY own_sel ON watch_history FOR SELECT TO authenticated USING (auth.uid() = user_id)';
  END IF;

  -- system_settings: public read (for maintenance mode)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='system_settings' AND policyname='pub_sel') THEN
    EXECUTE 'CREATE POLICY pub_sel ON system_settings FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;


-- 2. ERROR C: MISSING UNIQUE CONSTRAINTS
-- watch_history unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'watch_history_user_video_unique'
  ) THEN
    ALTER TABLE watch_history
    ADD CONSTRAINT watch_history_user_video_unique UNIQUE (user_id, video_id);
  END IF;
END $$;

-- video_notes unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'video_notes_user_video_unique'
  ) THEN
    ALTER TABLE video_notes
    ADD CONSTRAINT video_notes_user_video_unique UNIQUE (user_id, video_id);
  END IF;
END $$;

-- Also add RLS + policies for video_notes if missing
ALTER TABLE video_notes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_notes' AND policyname='own_all') THEN
    EXECUTE 'CREATE POLICY own_all ON video_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Also add RLS + policies for video_bookmarks if missing
ALTER TABLE video_bookmarks ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='video_bookmarks' AND policyname='own_all') THEN
    EXECUTE 'CREATE POLICY own_all ON video_bookmarks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- watch_history INSERT/UPDATE policy
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='watch_history' AND policyname='own_upsert') THEN
    EXECUTE 'CREATE POLICY own_upsert ON watch_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- 3. ERROR O: SEED SYSTEM SETTINGS
INSERT INTO system_settings (key, value) VALUES
  ('maintenance_mode', '{"enabled": false}'),
  ('allow_registrations', '{"enabled": true}'),
  ('platform_name', '{"text": "NexusEdu"}'),
  ('platform_color', '{"color": "#e50914"}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 4. ERROR N: PROMOTE ADMIN
UPDATE profiles
SET role = 'admin'
WHERE email = 'mdhosainp414@gmail.com';

-- 5. ERROR M: SEED TEST DATA
INSERT INTO subjects (name, name_bn, slug, icon_name, color, order_index, is_active)
VALUES
  ('Physics', 'পদার্থবিজ্ঞান', 'physics', 'Atom', '#e50914', 1, true),
  ('Chemistry', 'রসায়ন', 'chemistry', 'FlaskConical', '#f59e0b', 2, true),
  ('Mathematics', 'গণিত', 'mathematics', 'Calculator', '#3b82f6', 3, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO cycles (subject_id, name, name_bn, order_index, is_active)
SELECT id, 'Cycle 1', 'সাইকেল ১', 1, true
FROM subjects WHERE slug = 'physics'
ON CONFLICT DO NOTHING;

INSERT INTO chapters (cycle_id, name, name_bn, slug, requires_enrollment, order_index, is_active)
SELECT id, 'Chapter 1 - Motion', 'অধ্যায় ১ - গতি', 'motion', false, 1, true
FROM cycles WHERE name = 'Cycle 1'
ON CONFLICT DO NOTHING;
