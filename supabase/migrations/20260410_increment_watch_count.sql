CREATE OR REPLACE FUNCTION increment_watch_count(p_user_id uuid, p_video_id uuid)
RETURNS void AS $$
  INSERT INTO watch_history (user_id, video_id, watch_count, watched_at)
  VALUES (p_user_id, p_video_id, 1, now())
  ON CONFLICT (user_id, video_id) DO UPDATE
  SET watch_count = COALESCE(watch_history.watch_count, 0) + 1;
$$ LANGUAGE sql SECURITY DEFINER;
