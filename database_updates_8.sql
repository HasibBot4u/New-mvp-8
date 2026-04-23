CREATE OR REPLACE FUNCTION increment_watch_count(p_user_id uuid, p_video_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO watch_history (user_id, video_id, watch_count, progress_seconds, watched_at, updated_at)
  VALUES (p_user_id, p_video_id, 1, 0, now(), now())
  ON CONFLICT (user_id, video_id) DO UPDATE 
  SET watch_count = COALESCE(watch_history.watch_count, 0) + 1,
      updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
