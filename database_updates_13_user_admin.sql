-- ============================================================
-- NEXUSEDU ADMIN & ROLE FIX
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Ensure the 'role' column exists on 'profiles' mapping correctly.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- 2. Make mdhosainp414@gmail.com an admin
UPDATE profiles SET role = 'admin' WHERE id = '3f421b13-e8db-4480-aa37-bba3eb75e56c';
-- Or fallback with email if id is somehow different:
UPDATE profiles SET role = 'admin' WHERE email = 'mdhosainp414@gmail.com';

-- 3. Just to clean up any user_roles table if it was causing confusion
-- (We safely ignore it, but let's drop it if it's unused, actually keeping it is fine, we just don't use it in code)

-- 4. Check that we only have the correct 3 subjects
DELETE FROM subjects WHERE slug NOT IN ('physics', 'chemistry', 'math');

UPDATE subjects SET name = 'Physics', name_bn = 'পদার্থবিজ্ঞান', icon = 'Atom', color = 'from-zinc-500 to-zinc-400' WHERE slug = 'physics';
UPDATE subjects SET name = 'Chemistry', name_bn = 'রসায়ন', icon = 'FlaskConical', color = 'from-zinc-500 to-zinc-400' WHERE slug = 'chemistry';
UPDATE subjects SET name = 'Higher Math', name_bn = 'উচ্চতর গণিত', icon = 'Calculator', color = 'from-zinc-500 to-zinc-400' WHERE slug = 'math';
