-- 1. Create System Settings Table
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Allow all users to read settings
CREATE POLICY "Public read access to system_settings" 
ON system_settings FOR SELECT USING (true);

-- Allow only admins to write settings
CREATE POLICY "Admin write access to system_settings"
ON system_settings FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Insert default maintenance mode setting if missing
INSERT INTO system_settings (key, value)
VALUES ('maintenance_mode', '{"enabled": false}'::jsonb)
ON CONFLICT DO NOTHING;
