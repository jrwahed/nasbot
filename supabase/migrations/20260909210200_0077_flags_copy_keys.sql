-- ============================================================================
-- 0077 — نصوص شاشة «مقفول» في copy_strings
--
-- مفاتيح المزايا بقت بتتقرا فعلًا (A2)، وشاشة القفل مكوّن في
-- `src/components/FlagsProvider.tsx`. قاعدة CLAUDE.md §٣: أي نص معروض بيمر
-- بـ `t()` ومفتاحه في `copy_strings` — فالمفاتيح دي لازم تكون في القاعدة
-- علشان المالك يعدّلها من /admin/content زي أي نص تاني.
--
-- (رسالة كل ميزة لوحدها مش هنا — دي `feature_flags.off_message_ar` وبتتعدّل
--  من /admin/settings ← مفاتيح المزايا. اللي هنا العنوان والنص الاحتياطي بس.)
--
-- نفس المفاتيح موجودة في src/data/copy-fallback.ts و scripts/copy-seed.json
-- فالموقع شغّال بيهم من غير الهجرة دي — الهجرة بتخلّيهم **قابلين للتعديل**.
--
-- آمن يتكرر: on conflict do update.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('flags.closed.title', 'القسم ده مقفول دلوقتي', 'مفاتيح المزايا',
   'عنوان شاشة القفل — FlagsProvider.tsx'),
  ('flags.closed.body', 'بنظبط حاجة صغيرة هنا. ارجعلنا كمان شوية.', 'مفاتيح المزايا',
   'النص الاحتياطي لو رسالة الميزة فاضية'),
  ('flags.closed.mark', 'نسبوط', 'مفاتيح المزايا',
   'وصف علامة الاستفهام لقارئ الشاشة'),
  ('flags.off.note', 'مقفول دلوقتي', 'مفاتيح المزايا',
   'الزرار المعطّل في صفحة السبوطة لما الحجز مقفول')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);
