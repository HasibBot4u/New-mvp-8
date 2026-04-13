CREATE OR REPLACE FUNCTION increment_watch_count(p_user_id uuid, p_video_id uuid)
RETURNS void AS $$
  UPDATE watch_history SET watch_count = COALESCE(watch_count, 0) + 1
  WHERE user_id = p_user_id AND video_id = p_video_id;
$$ LANGUAGE sql SECURITY DEFINER;
