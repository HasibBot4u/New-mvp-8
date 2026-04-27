-- Fix Enrollment Logic
-- We need a chapter_access table to link users specifically to chapters, rather than a global `is_enrolled` flag.

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
  -- 0. Check if chapter requires enrollment at all
  SELECT requires_enrollment INTO v_requires_enrollment FROM chapters WHERE id = p_chapter_id;
  IF NOT v_requires_enrollment THEN
    RETURN true;
  END IF;

  -- 1. Check if user is admin
  SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();
  IF v_user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- 2. Check if user is globally enrolled
  SELECT is_enrolled INTO v_enrolled FROM profiles WHERE id = auth.uid();
  IF v_enrolled THEN
    RETURN true;
  END IF;

  -- 3. Check for specific chapter access
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
  WHERE code = p_code AND active = true AND (max_uses = 0 OR uses_count < max_uses);

  IF NOT FOUND THEN
    RETURN '{"success": false, "message_bn": "কোডটি অবৈধ বা মেয়াদোত্তীর্ণ"}'::jsonb;
  END IF;

  -- Verify it belongs to the correct chapter 
  -- Assuming code structure might dictate chapter_id or it's a global code.
  IF v_code_record.chapter_id IS NOT NULL AND v_code_record.chapter_id != p_chapter_id THEN
     RETURN '{"success": false, "message_bn": "এই কোডটি অন্য চ্যাপ্টারের জন্য"}'::jsonb;
  END IF;

  SELECT EXISTS(SELECT 1 FROM chapter_access WHERE user_id = auth.uid() AND chapter_id = p_chapter_id) INTO v_access_exists;

  IF v_access_exists THEN
     RETURN '{"success": false, "message_bn": "আপনি ইতিমধ্যে এনরোল করেছেন"}'::jsonb;
  END IF;

  INSERT INTO chapter_access(user_id, chapter_id, code_used_id, device_fingerprint)
  VALUES (auth.uid(), p_chapter_id, v_code_record.id, p_device_fingerprint);

  UPDATE enrollment_codes SET uses_count = uses_count + 1 WHERE id = v_code_record.id;

  RETURN '{"success": true, "message_bn": "এনরোলমেন্ট সফল হয়েছে"}'::jsonb;
END; $$;
