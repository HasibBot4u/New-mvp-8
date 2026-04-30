-- Bug Fixes: #D08, #D05, #D13, #D07, #A02
-- Add missing RLS policies
CREATE POLICY "rpc_insert" ON chapter_access FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own" ON video_notes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "admin_insert" ON notifications FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "admin_delete" ON activity_logs FOR DELETE USING (public.is_admin());

-- Redefine use_chapter_enrollment_code properly to ensure increment works
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

  IF NOT FOUND THEN
    RETURN '{"success": false, "message_bn": "কোডটি অবৈধ বা মেয়াদোত্তীর্ণ"}'::jsonb;
  END IF;

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
