-- Bug Fix: #A02 - Create get_admin_stats function
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
