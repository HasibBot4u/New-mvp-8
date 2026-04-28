-- ============================================================
-- NEXUSEDU DATABASE CLEANUP
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. DELETE ANY DUPLICATE SUBJECTS
-- We only want 'physics', 'chemistry', and 'math'
DELETE FROM subjects WHERE slug NOT IN ('physics', 'chemistry', 'math');

-- Update the names of the remaining subjects to match perfectly
UPDATE subjects SET name = 'Physics', name_bn = 'পদার্থবিজ্ঞান', icon = 'Atom', color = 'from-zinc-500 to-zinc-400' WHERE slug = 'physics';
UPDATE subjects SET name = 'Chemistry', name_bn = 'রসায়ন', icon = 'FlaskConical', color = 'from-zinc-500 to-zinc-400' WHERE slug = 'chemistry';
UPDATE subjects SET name = 'Higher Math', name_bn = 'উচ্চতর গণিত', icon = 'Calculator', color = 'from-zinc-500 to-zinc-400' WHERE slug = 'math';

-- If the user wants only EXACTLY these 3, and maybe any previous duplicates exist, the above queries will clean it up.
