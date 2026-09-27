-- ============================================================================
-- WORK_COPY.sql — نصوص طبقة «الشغل» في copy_strings (WORK_PLAN §0 #5)
-- الزق في SQL Editor — آمن يتكرر: المفتاح الموجود بيتحدّث نصّه، والجديد بيتضاف.
--
-- الأعمدة زي تعريف الجدول في 0036_copy_and_game_tables:
--   key (المفتاح: screen.section.element) · value_ar (النص) · screen (اسم الشاشة بالعربي)
--   · context_ar (مكان النص — اختياري) · max_length · is_html
--
-- المفاتيح نفسها موجودة في src/data/copy-fallback.ts و scripts/copy-seed.json
-- (الموقع بيشتغل بيهم فورًا). الملف ده بس علشان النصوص تتعدّل من اللوحة.
--
-- ⬇ الصف اللي تحت مثال واحد بس. مفاتيح الواجهة (المرحلة 2: /shoghl · /shoghl/[slug]
--   · /shoghl/pass · /shoghl/amaken · /me/shoghl · WorkStrip) هتتضاف هنا
--   من وكيل الواجهة بنفس الشكل — سطر لكل مفتاح، وفاصلة بين السطور.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('shoghl.hero.title', 'الشغل مش لازم يكون لوحدك.', 'الشغل', 'src/app/shoghl/page.tsx')
  -- ⬅ مفاتيح المرحلة 2 تتضاف هنا
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);
