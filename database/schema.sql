-- FILE: database/schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABLE 1: subjects
CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📚',
  color TEXT NOT NULL DEFAULT '#6C5CE7',
  description TEXT DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE 2: cycles
CREATE TABLE IF NOT EXISTS cycles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  telegram_channel_id TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE 3: chapters
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE 4: videos
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  telegram_file_id TEXT DEFAULT '',
  telegram_message_id INTEGER DEFAULT 0,
  telegram_channel_id TEXT DEFAULT '',
  duration TEXT DEFAULT '00:00:00',
  size_mb INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE 5: profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  total_watch_time_minutes INTEGER DEFAULT 0,
  videos_watched_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE 6: watch_history
CREATE TABLE IF NOT EXISTS watch_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  progress_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  watch_count INTEGER DEFAULT 1,
  watched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, video_id)
);

-- TABLE 7: activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  ip_address TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_cycles_subject_id ON cycles(subject_id);
CREATE INDEX IF NOT EXISTS idx_cycles_display_order ON cycles(display_order);
CREATE INDEX IF NOT EXISTS idx_chapters_cycle_id ON chapters(cycle_id);
CREATE INDEX IF NOT EXISTS idx_chapters_display_order ON chapters(display_order);
CREATE INDEX IF NOT EXISTS idx_videos_chapter_id ON videos(chapter_id);
CREATE INDEX IF NOT EXISTS idx_videos_display_order ON videos(display_order);
CREATE INDEX IF NOT EXISTS idx_videos_telegram_file_id ON videos(telegram_file_id);
CREATE INDEX IF NOT EXISTS idx_videos_is_active ON videos(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked ON profiles(is_blocked);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_video_id ON watch_history(video_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_last_watched ON watch_history(watched_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- RLS POLICIES
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE watch_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  RETURN user_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Subjects policies
CREATE POLICY "public_read_active" ON subjects FOR SELECT USING (is_active = true);
CREATE POLICY "admin_all" ON subjects FOR ALL USING (public.is_admin());

-- Cycles policies
CREATE POLICY "public_read_active" ON cycles FOR SELECT USING (is_active = true);
CREATE POLICY "admin_all" ON cycles FOR ALL USING (public.is_admin());

-- Chapters policies
CREATE POLICY "public_read_active" ON chapters FOR SELECT USING (is_active = true);
CREATE POLICY "admin_all" ON chapters FOR ALL USING (public.is_admin());

-- Videos policies
CREATE POLICY "public_read_active" ON videos FOR SELECT USING (is_active = true);
CREATE POLICY "admin_all" ON videos FOR ALL USING (public.is_admin());

-- Profiles policies
CREATE POLICY "auth_read_all" ON profiles FOR SELECT USING (
  id = auth.uid() OR public.is_admin()
);
CREATE POLICY "users_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
-- We can use is_admin() for UPDATE/DELETE because those don't trigger the SELECT policy loop
CREATE POLICY "admin_update_all" ON profiles FOR UPDATE USING (public.is_admin());
CREATE POLICY "admin_delete_all" ON profiles FOR DELETE USING (public.is_admin());

-- Watch history policies
CREATE POLICY "users_manage_own" ON watch_history FOR ALL USING (user_id = auth.uid());
CREATE POLICY "admin_read_all" ON watch_history FOR SELECT USING (public.is_admin());

-- Activity logs policies
CREATE POLICY "anyone_insert" ON activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_read_all" ON activity_logs FOR SELECT USING (public.is_admin());

-- TRIGGERS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_subjects_updated_at ON subjects;
CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_cycles_updated_at ON cycles;
CREATE TRIGGER update_cycles_updated_at BEFORE UPDATE ON cycles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_chapters_updated_at ON chapters;
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON chapters FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Fix System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to system_settings" ON system_settings FOR SELECT USING (true);
CREATE POLICY "Admin write access to system_settings" ON system_settings FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
INSERT INTO system_settings (key, value) VALUES ('maintenance_mode', '{"enabled": false}'::jsonb) ON CONFLICT DO NOTHING;

-- Fix Enrollment Logic
CREATE TABLE IF NOT EXISTS chapter_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  code_used_id UUID REFERENCES enrollment_codes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  device_fingerprint TEXT,
  UNIQUE(user_id, chapter_id)
);
ALTER TABLE chapter_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own access" ON chapter_access FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION check_chapter_access(
  p_chapter_id uuid,
  p_device_fingerprint text DEFAULT ''
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_role text;
  v_enrolled boolean;
  v_chapter_access_exists boolean;
  v_requires_enrollment boolean;
BEGIN
  SELECT requires_enrollment INTO v_requires_enrollment FROM chapters WHERE id = p_chapter_id;
  IF NOT v_requires_enrollment THEN RETURN true; END IF;
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role = 'admin' THEN RETURN true; END IF;
  SELECT is_enrolled INTO v_enrolled FROM profiles WHERE id = auth.uid();
  IF v_enrolled THEN RETURN true; END IF;
  SELECT EXISTS(
    SELECT 1 FROM chapter_access 
    WHERE user_id = auth.uid() AND chapter_id = p_chapter_id
  ) INTO v_chapter_access_exists;
  RETURN v_chapter_access_exists;
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
  v_access_exists boolean;
BEGIN
  SELECT * INTO v_code_record FROM enrollment_codes 
  WHERE code = p_code AND is_active = true AND (max_uses = 0 OR uses_count < max_uses);
  IF NOT FOUND THEN RETURN '{"success": false, "message_bn": "কোডটি অবৈধ বা মেয়াদোত্তীর্ণ"}'::jsonb; END IF;
  IF v_code_record.chapter_id IS NOT NULL AND v_code_record.chapter_id != p_chapter_id THEN
     RETURN '{"success": false, "message_bn": "এই কোডটি অন্য চ্যাপ্টারের জন্য"}'::jsonb;
  END IF;
  SELECT EXISTS(SELECT 1 FROM chapter_access WHERE user_id = auth.uid() AND chapter_id = p_chapter_id) INTO v_access_exists;
  IF v_access_exists THEN RETURN '{"success": false, "message_bn": "আপনি ইতিমধ্যে এনরোল করেছেন"}'::jsonb; END IF;
  INSERT INTO chapter_access(user_id, chapter_id, code_used_id, device_fingerprint)
  VALUES (auth.uid(), p_chapter_id, v_code_record.id, p_device_fingerprint);
  UPDATE enrollment_codes SET uses_count = uses_count + 1 WHERE id = v_code_record.id;
  RETURN '{"success": true, "message_bn": "এনরোলমেন্ট সফল হয়েছে"}'::jsonb;
END; $$;

-- Admin Stats Function
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'total_videos', (SELECT count(*) FROM videos WHERE is_active=true),
    'total_subjects', (SELECT count(*) FROM subjects WHERE is_active=true),
    'total_chapters', (SELECT count(*) FROM chapters WHERE is_active=true),
    'active_users_today', (SELECT count(DISTINCT user_id) FROM watch_history WHERE watched_at > now() - interval '1 day'),
    'new_signups_this_week', (SELECT count(*) FROM profiles WHERE created_at > now() - interval '7 days'),
    'total_watch_seconds', (SELECT COALESCE(sum(progress_seconds),0) FROM watch_history),
    'enrollment_codes_used', (SELECT count(*) FROM enrollment_codes WHERE uses_count > 0)
  );
END;
$$;