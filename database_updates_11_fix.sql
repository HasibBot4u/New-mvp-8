-- ============================================================
-- NEXUSEDU MISSING COLUMNS FIX
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add missing columns to chapters
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS slug TEXT DEFAULT '';
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- 2. Add missing columns to subjects (renamed icon_name to icon in frontend but let's cover both in DB to be safe, or just icon)
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '';

-- 3. Now run the insert that failed:
DO $$
DECLARE
  subj RECORD;
  cyc_id UUID;
BEGIN
  FOR subj IN SELECT id, slug FROM subjects WHERE slug IN ('physics','chemistry','higher-math') LOOP
    SELECT id INTO cyc_id FROM cycles
    WHERE subject_id = subj.id AND name = 'Cycle 1'
    LIMIT 1;

    IF cyc_id IS NOT NULL THEN
      INSERT INTO chapters (cycle_id, name, name_bn, slug, requires_enrollment, display_order, is_active, description)
      VALUES (
        cyc_id,
        'Chapter 1 - Free Preview',
        'অধ্যায় ১ - ফ্রি প্রিভিউ',
        subj.slug || '-c1-ch1',
        false,
        1,
        true,
        'এনরোলমেন্ট ছাড়াই দেখুন'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
